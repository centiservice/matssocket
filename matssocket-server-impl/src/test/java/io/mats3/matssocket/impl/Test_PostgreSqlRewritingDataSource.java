package io.mats3.matssocket.impl;

import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.concurrent.atomic.AtomicReference;

import javax.sql.DataSource;

import org.junit.Assert;
import org.junit.Test;

public class Test_PostgreSqlRewritingDataSource {

    @Test
    public void rewriteSqlTransformsTopToLimit() {
        String sql = "SELECT TOP 20 smid, trace_id FROM mats_socket_outbox WHERE session_id = ?";

        String rewritten = PostgreSqlRewritingDataSource.rewriteSql(sql);

        Assert.assertEquals(
                "SELECT smid, trace_id FROM mats_socket_outbox WHERE session_id = ? LIMIT 20",
                rewritten);
    }

    @Test
    public void dataSourceWrapsPreparedStatementSql() throws Exception {
        AtomicReference<String> preparedSql = new AtomicReference<>();

        PreparedStatement preparedStatement = (PreparedStatement) Proxy.newProxyInstance(
                getClass().getClassLoader(),
                new Class<?>[] { PreparedStatement.class },
                (proxy, method, args) -> defaultValue(method.getReturnType()));

        Connection connection = (Connection) Proxy.newProxyInstance(
                getClass().getClassLoader(),
                new Class<?>[] { Connection.class },
                (proxy, method, args) -> {
                    if ("prepareStatement".equals(method.getName())) {
                        preparedSql.set((String) args[0]);
                        return preparedStatement;
                    }
                    return defaultValue(method.getReturnType());
                });

        DataSource delegate = (DataSource) Proxy.newProxyInstance(
                getClass().getClassLoader(),
                new Class<?>[] { DataSource.class },
                (proxy, method, args) -> {
                    if ("getConnection".equals(method.getName())) {
                        return connection;
                    }
                    return defaultValue(method.getReturnType());
                });

        DataSource dataSource = new PostgreSqlRewritingDataSource(delegate);
        dataSource.getConnection().prepareStatement(
                "SELECT TOP 5 smid, trace_id FROM mats_socket_outbox WHERE session_id = ?");

        Assert.assertEquals(
                "SELECT smid, trace_id FROM mats_socket_outbox WHERE session_id = ? LIMIT 5",
                preparedSql.get());
    }

    private static Object defaultValue(Class<?> returnType) {
        if (!returnType.isPrimitive()) {
            return null;
        }
        if (returnType == boolean.class) {
            return false;
        }
        if (returnType == byte.class) {
            return (byte) 0;
        }
        if (returnType == short.class) {
            return (short) 0;
        }
        if (returnType == int.class) {
            return 0;
        }
        if (returnType == long.class) {
            return 0L;
        }
        if (returnType == float.class) {
            return 0f;
        }
        if (returnType == double.class) {
            return 0d;
        }
        if (returnType == char.class) {
            return '\0';
        }
        throw new IllegalArgumentException("Unknown primitive type: " + returnType);
    }
}
