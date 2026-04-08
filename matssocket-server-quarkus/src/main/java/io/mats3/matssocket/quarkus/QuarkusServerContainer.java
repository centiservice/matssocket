package io.mats3.matssocket.quarkus;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.websocket.ClientEndpointConfig;
import jakarta.websocket.DeploymentException;
import jakarta.websocket.Endpoint;
import jakarta.websocket.Extension;
import jakarta.websocket.Session;
import jakarta.websocket.server.ServerContainer;
import jakarta.websocket.server.ServerEndpointConfig;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Stores the endpoint config that MatsSocket registers for a Quarkus setup.
 */
public class QuarkusServerContainer implements ServerContainer {

    private static final Logger log = LoggerFactory.getLogger(QuarkusServerContainer.class);

    private final ConcurrentHashMap<String, ServerEndpointConfig> endpointConfigs = new ConcurrentHashMap<>();

    private long defaultAsyncSendTimeout = 10000;
    private long defaultMaxSessionIdleTimeout = 0;
    private int defaultMaxBinaryMessageBufferSize = 65536;
    private int defaultMaxTextMessageBufferSize = 65536;

    @Override
    public void addEndpoint(ServerEndpointConfig serverConfig) throws DeploymentException {
        String path = serverConfig.getPath();
        log.info("MatsSocket registering endpoint at path: {}", path);
        endpointConfigs.put(path, serverConfig);
    }

    @Override
    public void addEndpoint(Class<?> endpointClass) throws DeploymentException {
        throw new UnsupportedOperationException(
            "Annotation-based endpoints not supported in Quarkus adapter. Use addEndpoint(ServerEndpointConfig).");
    }

    public ServerEndpointConfig getEndpointConfig(String path) {
        return endpointConfigs.get(path);
    }

    @Override
    public void upgradeHttpToWebSocket(Object httpServletRequest, Object httpServletResponse,
            ServerEndpointConfig sec, Map<String, String> pathParameters)
            throws IOException, DeploymentException {
        throw new UnsupportedOperationException(
            "Programmatic HTTP upgrade not supported in Quarkus. Use @WebSocket annotations.");
    }

    @Override
    public Session connectToServer(Object annotatedEndpointInstance, java.net.URI path) throws DeploymentException, IOException {
        throw new UnsupportedOperationException("Client connections not supported in server adapter");
    }

    @Override
    public Session connectToServer(Class<?> annotatedEndpointClass, java.net.URI path) throws DeploymentException, IOException {
        throw new UnsupportedOperationException("Client connections not supported in server adapter");
    }

    @Override
    public Session connectToServer(Endpoint endpointInstance, ClientEndpointConfig cec, java.net.URI path)
            throws DeploymentException, IOException {
        throw new UnsupportedOperationException("Client connections not supported in server adapter");
    }

    @Override
    public Session connectToServer(Class<? extends Endpoint> endpointClass, ClientEndpointConfig cec, java.net.URI path)
            throws DeploymentException, IOException {
        throw new UnsupportedOperationException("Client connections not supported in server adapter");
    }

    @Override
    public long getDefaultAsyncSendTimeout() {
        return defaultAsyncSendTimeout;
    }

    @Override
    public void setAsyncSendTimeout(long timeoutmillis) {
        this.defaultAsyncSendTimeout = timeoutmillis;
    }

    @Override
    public long getDefaultMaxSessionIdleTimeout() {
        return defaultMaxSessionIdleTimeout;
    }

    @Override
    public void setDefaultMaxSessionIdleTimeout(long timeout) {
        this.defaultMaxSessionIdleTimeout = timeout;
    }

    @Override
    public int getDefaultMaxBinaryMessageBufferSize() {
        return defaultMaxBinaryMessageBufferSize;
    }

    @Override
    public void setDefaultMaxBinaryMessageBufferSize(int max) {
        this.defaultMaxBinaryMessageBufferSize = max;
    }

    @Override
    public int getDefaultMaxTextMessageBufferSize() {
        return defaultMaxTextMessageBufferSize;
    }

    @Override
    public void setDefaultMaxTextMessageBufferSize(int max) {
        this.defaultMaxTextMessageBufferSize = max;
    }

    @Override
    public Set<Extension> getInstalledExtensions() {
        return Set.of();
    }
}
