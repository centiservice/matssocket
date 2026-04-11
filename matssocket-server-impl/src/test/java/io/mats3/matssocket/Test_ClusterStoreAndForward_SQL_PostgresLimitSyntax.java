package io.mats3.matssocket;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.function.BiFunction;

import javax.sql.DataSource;

import org.h2.jdbcx.JdbcConnectionPool;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.AfterClass;
import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;

import io.mats3.MatsFactory.ContextLocal;
import io.mats3.matssocket.ClusterStoreAndForward.StoredOutMessage;
import io.mats3.matssocket.MatsSocketServer.MessageType;
import io.mats3.matssocket.impl.ClusterStoreAndForward_SQL;
import io.mats3.matssocket.impl.ClusterStoreAndForward_SQL_DbMigrations;
import io.mats3.matssocket.impl.ClusterStoreAndForward_SQL_DbMigrations.Database;

/**
 * Tests that {@link ClusterStoreAndForward_SQL#useLimitInsteadOfTop(boolean)} correctly switches from MS SQL's
 * {@code "SELECT TOP n .."} to PostgreSQL's {@code "SELECT .. LIMIT n"} syntax. Uses a SQL-capturing DataSource proxy
 * to verify the actual SQL produced, since H2 accepts both syntaxes and a roundtrip-only test would not catch a no-op.
 *
 * @author Thor Egil Kolltveit 2026-04-10 08:14 - thoregil@kolltveit.org
 */
public class Test_ClusterStoreAndForward_SQL_PostgresLimitSyntax {

    private static JdbcConnectionPool _dataSource;
    private static final String SESSION_ID = "TestSession_Limit";
    private static final String NODE_NAME = "testnode";

    @BeforeClass
    public static void setup() throws Exception {
        // Initialize ContextLocal callback to return empty (no Mats stage context), so CSAF falls back to DataSource.
        Field callbackField = ContextLocal.class.getDeclaredField("callback");
        callbackField.setAccessible(true);
        callbackField.set(null, (BiFunction<Class<?>, String[], Optional<?>>) (type, keys) -> Optional.empty());

        JdbcDataSource h2Ds = new JdbcDataSource();
        h2Ds.setURL("jdbc:h2:mem:Test_PostgresLimitSyntax;DB_CLOSE_DELAY=-1");
        _dataSource = JdbcConnectionPool.create(h2Ds);

        // Migrate tables
        ClusterStoreAndForward_SQL_DbMigrations.create(Database.H2).migrateUsingFlyway(_dataSource);

        // Seed session and outbox data directly via SQL (bypassing ContextLocal requirement)
        try (Connection con = _dataSource.getConnection()) {
            con.setAutoCommit(false);

            PreparedStatement insertSession = con.prepareStatement(
                    "INSERT INTO mats_socket_session"
                            + " (session_id, connection_id, nodename, user_id, client_lib,"
                            + " app_name, app_version, created_timestamp, liveliness_timestamp)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            insertSession.setString(1, SESSION_ID);
            insertSession.setString(2, "conn1");
            insertSession.setString(3, NODE_NAME);
            insertSession.setString(4, "TestUser");
            insertSession.setString(5, "TestLib/1.0");
            insertSession.setString(6, "TestApp");
            insertSession.setString(7, "1.0");
            insertSession.setLong(8, System.currentTimeMillis());
            insertSession.setLong(9, System.currentTimeMillis());
            insertSession.execute();

            // Insert 3 messages into the outbox table for this session
            int tableNum = Math.floorMod(SESSION_ID.hashCode(), 7);
            String tableName = "mats_socket_outbox_" + (tableNum < 10 ? "0" + tableNum : tableNum);
            for (int i = 0; i < 3; i++) {
                PreparedStatement insert = con.prepareStatement(
                        "INSERT INTO " + tableName
                                + " (session_id, smid, trace_id, type, cmid, request_timestamp,"
                                + " stored_timestamp, delivery_count, envelope, message_text)"
                                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                insert.setString(1, SESSION_ID);
                insert.setString(2, "smid_" + i);
                insert.setString(3, "traceId_" + i);
                insert.setString(4, MessageType.RESOLVE.name());
                insert.setString(5, "cmid_" + i);
                insert.setLong(6, System.currentTimeMillis());
                insert.setLong(7, System.currentTimeMillis());
                insert.setInt(8, 0);
                insert.setString(9, "envelope_" + i);
                insert.setString(10, "message_" + i);
                insert.execute();
            }
            con.commit();
        }
    }

    @AfterClass
    public static void teardown() {
        _dataSource.dispose();
    }

    // ---- Helper: DataSource proxy that captures SQL from prepareStatement calls ----

    private static DataSource capturingDataSource(DataSource delegate, List<String> capturedSql) {
        return (DataSource) Proxy.newProxyInstance(DataSource.class.getClassLoader(),
                new Class<?>[] { DataSource.class },
                (proxy, method, args) -> {
                    Object result = method.invoke(delegate, args);
                    if ("getConnection".equals(method.getName()) && result instanceof Connection) {
                        return capturingConnection((Connection) result, capturedSql);
                    }
                    return result;
                });
    }

    private static Connection capturingConnection(Connection delegate, List<String> capturedSql) {
        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(),
                new Class<?>[] { Connection.class },
                (proxy, method, args) -> {
                    if ("prepareStatement".equals(method.getName()) && args != null && args[0] instanceof String) {
                        capturedSql.add((String) args[0]);
                    }
                    try {
                        return method.invoke(delegate, args);
                    }
                    catch (InvocationTargetException e) {
                        throw e.getCause();
                    }
                });
    }

    // ---- Tests ----

    /**
     * Verify that with useLimitInsteadOfTop(true), the SQL uses LIMIT and not TOP.
     */
    @Test
    public void limitSyntax_shouldEmitLimitNotTop() throws Exception {
        List<String> capturedSql = new ArrayList<>();
        ClusterStoreAndForward_SQL csaf = ClusterStoreAndForward_SQL.create(
                capturingDataSource(_dataSource, capturedSql), NODE_NAME);
        csaf.useLimitInsteadOfTop(true);

        List<StoredOutMessage> messages = csaf.getMessagesFromOutbox(SESSION_ID, 2);
        Assert.assertEquals(2, messages.size());

        // Find the outbox SELECT query
        String outboxSql = capturedSql.stream()
                .filter(s -> s.contains("mats_socket_outbox"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No outbox SQL captured"));
        Assert.assertTrue("SQL should contain LIMIT: " + outboxSql, outboxSql.contains("LIMIT"));
        Assert.assertFalse("SQL should not contain TOP: " + outboxSql, outboxSql.contains("TOP"));
    }

    /**
     * Verify that the default (no flag set) still uses TOP syntax.
     */
    @Test
    public void defaultSyntax_shouldEmitTopNotLimit() throws Exception {
        List<String> capturedSql = new ArrayList<>();
        ClusterStoreAndForward_SQL csaf = ClusterStoreAndForward_SQL.create(
                capturingDataSource(_dataSource, capturedSql), NODE_NAME);
        // Note: NOT calling useLimitInsteadOfTop - default is false (TOP syntax)

        List<StoredOutMessage> messages = csaf.getMessagesFromOutbox(SESSION_ID, 2);
        Assert.assertEquals(2, messages.size());

        String outboxSql = capturedSql.stream()
                .filter(s -> s.contains("mats_socket_outbox"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No outbox SQL captured"));
        Assert.assertTrue("SQL should contain TOP: " + outboxSql, outboxSql.contains("TOP"));
        Assert.assertFalse("SQL should not contain LIMIT: " + outboxSql, outboxSql.contains("LIMIT"));
    }

    /**
     * Verify that setDatabase(POSTGRESQL) configures LIMIT syntax.
     */
    @Test
    public void setDatabase_postgresql_shouldEmitLimit() throws Exception {
        List<String> capturedSql = new ArrayList<>();
        ClusterStoreAndForward_SQL csaf = ClusterStoreAndForward_SQL.create(
                capturingDataSource(_dataSource, capturedSql), NODE_NAME);
        csaf.setDatabase(Database.POSTGRESQL);

        List<StoredOutMessage> messages = csaf.getMessagesFromOutbox(SESSION_ID, 2);
        Assert.assertEquals(2, messages.size());

        String outboxSql = capturedSql.stream()
                .filter(s -> s.contains("mats_socket_outbox"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No outbox SQL captured"));
        Assert.assertTrue("SQL should contain LIMIT: " + outboxSql, outboxSql.contains("LIMIT"));
        Assert.assertFalse("SQL should not contain TOP: " + outboxSql, outboxSql.contains("TOP"));
    }

    /**
     * Verify that setDatabase(MS_SQL_UTF8) keeps TOP syntax.
     */
    @Test
    public void setDatabase_mssql_shouldEmitTop() throws Exception {
        List<String> capturedSql = new ArrayList<>();
        ClusterStoreAndForward_SQL csaf = ClusterStoreAndForward_SQL.create(
                capturingDataSource(_dataSource, capturedSql), NODE_NAME);
        csaf.setDatabase(Database.MS_SQL_UTF8);

        List<StoredOutMessage> messages = csaf.getMessagesFromOutbox(SESSION_ID, 2);
        Assert.assertEquals(2, messages.size());

        String outboxSql = capturedSql.stream()
                .filter(s -> s.contains("mats_socket_outbox"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No outbox SQL captured"));
        Assert.assertTrue("SQL should contain TOP: " + outboxSql, outboxSql.contains("TOP"));
        Assert.assertFalse("SQL should not contain LIMIT: " + outboxSql, outboxSql.contains("LIMIT"));
    }
}
