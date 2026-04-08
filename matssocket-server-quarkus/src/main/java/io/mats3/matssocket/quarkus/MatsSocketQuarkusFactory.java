package io.mats3.matssocket.quarkus;

import io.mats3.MatsFactory;
import io.mats3.matssocket.AuthenticationPlugin;
import io.mats3.matssocket.ClusterStoreAndForward;
import io.mats3.matssocket.MatsSocketServer;
import io.mats3.matssocket.impl.DefaultMatsSocketServer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Creates Quarkus-specific MatsSocket setups.
 */
public final class MatsSocketQuarkusFactory {

    private static final Logger log = LoggerFactory.getLogger(MatsSocketQuarkusFactory.class);

    private MatsSocketQuarkusFactory() {
    }

    /**
     * Create a MatsSocketServer configured for Quarkus.
     *
     * @param matsFactory The MATS factory for messaging
     * @param clusterStoreAndForward Storage for reliable message delivery
     * @param authenticationPlugin Plugin to authenticate WebSocket connections
     * @param websocketPath The path where the WebSocket endpoint will be mounted (e.g., "/matssocket")
     * @return Setup containing both the server and bridge
     */
    public static MatsSocketQuarkusSetup create(
            MatsFactory matsFactory,
            ClusterStoreAndForward clusterStoreAndForward,
            AuthenticationPlugin authenticationPlugin,
            String websocketPath) {

        return create(matsFactory, clusterStoreAndForward, authenticationPlugin,
            matsFactory.getFactoryConfig().getAppName(), websocketPath);
    }

    /**
     * Create a MatsSocketServer configured for Quarkus with a specific instance name.
     *
     * @param matsFactory The MATS factory for messaging
     * @param clusterStoreAndForward Storage for reliable message delivery
     * @param authenticationPlugin Plugin to authenticate WebSocket connections
     * @param instanceName Name for this MatsSocket instance
     * @param websocketPath The path where the WebSocket endpoint will be mounted
     * @return Setup containing both the server and bridge
     */
    public static MatsSocketQuarkusSetup create(
            MatsFactory matsFactory,
            ClusterStoreAndForward clusterStoreAndForward,
            AuthenticationPlugin authenticationPlugin,
            String instanceName,
            String websocketPath) {

        log.info("Creating MatsSocketServer for Quarkus at path: {}", websocketPath);

        QuarkusServerContainer serverContainer = new QuarkusServerContainer();

        MatsSocketServer matsSocketServer = DefaultMatsSocketServer.createMatsSocketServer(
            serverContainer,
            matsFactory,
            clusterStoreAndForward,
            authenticationPlugin,
            instanceName,
            websocketPath
        );

        QuarkusMatsSocketBridge bridge = new QuarkusMatsSocketBridge(serverContainer, websocketPath);

        log.info("MatsSocketServer created successfully at path: {}", websocketPath);

        return new MatsSocketQuarkusSetup(matsSocketServer, bridge, serverContainer, websocketPath);
    }

    /**
     * Result of creating a MatsSocket setup for Quarkus.
     */
    public record MatsSocketQuarkusSetup(
        MatsSocketServer server,
        QuarkusMatsSocketBridge bridge,
        QuarkusServerContainer serverContainer,
        String websocketPath
    ) {}
}
