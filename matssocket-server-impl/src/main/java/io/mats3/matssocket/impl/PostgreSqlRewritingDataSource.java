package io.mats3.matssocket.impl;

import java.io.PrintWriter;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.sql.DataSource;

/**
 * DataSource wrapper that rewrites SQL Server "SELECT TOP n" syntax to PostgreSQL "LIMIT n".
 * <p>
 * This is needed because MatsSocket's ClusterStoreAndForward_SQL uses SQL Server syntax.
 * <p>
 * Usage:
 * <pre>{@code
 * DataSource dataSource = new PostgreSqlRewritingDataSource(actualDataSource);
 * ClusterStoreAndForward_SQL csaf = ClusterStoreAndForward_SQL.create(dataSource, nodeName);
 * }</pre>
 */
public class PostgreSqlRewritingDataSource implements DataSource {

    private final DataSource delegate;

    // Pattern to match "SELECT TOP n" and capture the number
    private static final Pattern TOP_PATTERN = Pattern.compile(
            "SELECT\\s+TOP\\s+(\\d+)\\s+", Pattern.CASE_INSENSITIVE);

    public PostgreSqlRewritingDataSource(DataSource delegate) {
        this.delegate = delegate;
    }

    @Override
    public Connection getConnection() throws SQLException {
        return wrapConnection(delegate.getConnection());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return wrapConnection(delegate.getConnection(username, password));
    }

    /**
     * Rewrite SQL Server TOP syntax to PostgreSQL LIMIT syntax.
     * "SELECT TOP 20 col1, col2 FROM ..." becomes "SELECT col1, col2 FROM ... LIMIT 20"
     */
    static String rewriteSql(String sql) {
        if (sql == null) {
            return null;
        }
        Matcher matcher = TOP_PATTERN.matcher(sql);
        if (matcher.find()) {
            String limit = matcher.group(1);
            // Remove "TOP n" and append "LIMIT n" at the end
            String rewritten = matcher.replaceFirst("SELECT ");
            return rewritten + " LIMIT " + limit;
        }
        return sql;
    }

    private Connection wrapConnection(Connection connection) {
        return (Connection) Proxy.newProxyInstance(
                Connection.class.getClassLoader(),
                new Class<?>[] { Connection.class },
                (proxy, method, args) -> {
                    Object[] actualArgs = args;
                    if ((actualArgs != null) && (actualArgs.length > 0)
                            && (actualArgs[0] instanceof String)
                            && "prepareStatement".equals(method.getName())) {
                        actualArgs = actualArgs.clone();
                        actualArgs[0] = rewriteSql((String) actualArgs[0]);
                    }
                    try {
                        return method.invoke(connection, actualArgs);
                    }
                    catch (InvocationTargetException e) {
                        throw e.getCause();
                    }
                });
    }

    @Override
    public PrintWriter getLogWriter() throws SQLException {
        return delegate.getLogWriter();
    }

    @Override
    public void setLogWriter(PrintWriter out) throws SQLException {
        delegate.setLogWriter(out);
    }

    @Override
    public void setLoginTimeout(int seconds) throws SQLException {
        delegate.setLoginTimeout(seconds);
    }

    @Override
    public int getLoginTimeout() throws SQLException {
        return delegate.getLoginTimeout();
    }

    @Override
    public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        return delegate.getParentLogger();
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        return delegate.unwrap(iface);
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) throws SQLException {
        return delegate.isWrapperFor(iface);
    }
}
