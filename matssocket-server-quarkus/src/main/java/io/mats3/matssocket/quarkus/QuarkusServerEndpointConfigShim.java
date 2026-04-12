package io.mats3.matssocket.quarkus;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.websocket.Decoder;
import jakarta.websocket.Encoder;
import jakarta.websocket.Extension;
import jakarta.websocket.server.ServerEndpointConfig;

/**
 * Jakarta {@link ServerEndpointConfig} auth-edge shim for Quarkus. Provides path, subprotocols and user properties
 * to {@link io.mats3.matssocket.AuthenticationPlugin.SessionAuthenticator#checkHandshake} and {@code onOpen}.
 *
 * @author Thor Egil Kolltveit 2026-04-12 - thoregil@kolltveit.org
 */
public class QuarkusServerEndpointConfigShim implements ServerEndpointConfig {

    private final String _path;
    private final Map<String, Object> _userProperties = new ConcurrentHashMap<>();

    QuarkusServerEndpointConfigShim(String path) {
        _path = path;
    }

    @Override
    public String getPath() {
        return _path;
    }

    @Override
    public List<String> getSubprotocols() {
        return Collections.singletonList("matssocket");
    }

    @Override
    public Map<String, Object> getUserProperties() {
        return _userProperties;
    }

    @Override
    public Class<?> getEndpointClass() {
        return Void.class; // Not meaningful for Quarkus transport.
    }

    @Override
    public List<Class<? extends Encoder>> getEncoders() {
        return Collections.emptyList();
    }

    @Override
    public List<Class<? extends Decoder>> getDecoders() {
        return Collections.emptyList();
    }

    @Override
    public List<Extension> getExtensions() {
        return Collections.emptyList();
    }

    @Override
    public Configurator getConfigurator() {
        return null;
    }
}
