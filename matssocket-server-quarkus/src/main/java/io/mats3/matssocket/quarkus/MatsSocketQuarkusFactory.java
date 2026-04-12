package io.mats3.matssocket.quarkus;

import io.mats3.MatsFactory;
import io.mats3.matssocket.AuthenticationPlugin;
import io.mats3.matssocket.ClusterStoreAndForward;
import io.mats3.matssocket.MatsSocketServer;
import io.mats3.matssocket.impl.DefaultMatsSocketServer;

/**
 * Factory for creating a {@link MatsSocketServer} with Quarkus WebSockets Next transport. Uses the internal
 * {@link io.mats3.matssocket.impl.MatsSocketTransportSession} abstraction instead of faking a Jakarta
 * {@code ServerContainer}/{@code Endpoint} lifecycle.
 * <p>
 * Usage:
 * <pre>{@code
 * MatsSocketQuarkusSetup setup = MatsSocketQuarkusFactory.create(
 *         matsFactory, csaf, authPlugin, "/matssocket");
 * // Wire up your @WebSocket endpoint to delegate to setup.transport()
 * }</pre>
 */
public class MatsSocketQuarkusFactory {

    /**
     * Creates a MatsSocketServer with Quarkus transport.
     *
     * @return a {@link MatsSocketQuarkusSetup} containing the server and transport bridge.
     */
    public static MatsSocketQuarkusSetup create(MatsFactory matsFactory, ClusterStoreAndForward csaf,
            AuthenticationPlugin authPlugin, String websocketPath) {
        return create(matsFactory, csaf, authPlugin,
                matsFactory.getFactoryConfig().getAppName(), websocketPath);
    }

    /**
     * Creates a MatsSocketServer with Quarkus transport and explicit instance name.
     */
    public static MatsSocketQuarkusSetup create(MatsFactory matsFactory, ClusterStoreAndForward csaf,
            AuthenticationPlugin authPlugin, String instanceName, String websocketPath) {
        // Create MatsSocketServer without Jakarta endpoint registration
        DefaultMatsSocketServer server = DefaultMatsSocketServer.createForExternalTransport(
                matsFactory, csaf, authPlugin, instanceName);

        // Create the Quarkus transport bridge
        QuarkusMatsSocketTransport transport = new QuarkusMatsSocketTransport(server, authPlugin, websocketPath);

        return new MatsSocketQuarkusSetup(server, transport, websocketPath);
    }

    /**
     * Setup result containing the MatsSocketServer and the Quarkus transport bridge.
     */
    public record MatsSocketQuarkusSetup(
            MatsSocketServer server,
            QuarkusMatsSocketTransport transport,
            String websocketPath) {
    }
}
