package io.mats3.matssocket.quarkus;

import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import org.junit.Assert;
import org.junit.Test;

import io.mats3.MatsEndpoint;
import io.mats3.MatsFactory;
import io.mats3.MatsStage;
import io.mats3.matssocket.AuthenticationPlugin;
import io.mats3.matssocket.ClusterStoreAndForward;

public class Test_MatsSocketQuarkusFactory {

    @Test
    public void createReturnsIndependentSetupsForEachWebSocketPath() {
        MatsFactory matsFactory = createMatsFactory("test-app", "test-node");
        ClusterStoreAndForward clusterStoreAndForward = createClusterStoreAndForward();
        AuthenticationPlugin authenticationPlugin = createAuthenticationPlugin();

        MatsSocketQuarkusFactory.MatsSocketQuarkusSetup first = MatsSocketQuarkusFactory.create(
                matsFactory,
                clusterStoreAndForward,
                authenticationPlugin,
                "instance-one",
                "/socket-one");
        MatsSocketQuarkusFactory.MatsSocketQuarkusSetup second = MatsSocketQuarkusFactory.create(
                matsFactory,
                clusterStoreAndForward,
                authenticationPlugin,
                "instance-two",
                "/socket-two");

        try {
            Assert.assertNotSame(first.serverContainer(), second.serverContainer());
            Assert.assertNotSame(first.bridge(), second.bridge());
            Assert.assertNotSame(first.server(), second.server());
            Assert.assertEquals("/socket-one", first.websocketPath());
            Assert.assertEquals("/socket-two", second.websocketPath());
            Assert.assertNotNull(first.serverContainer().getEndpointConfig("/socket-one"));
            Assert.assertNull(first.serverContainer().getEndpointConfig("/socket-two"));
            Assert.assertNull(second.serverContainer().getEndpointConfig("/socket-one"));
            Assert.assertNotNull(second.serverContainer().getEndpointConfig("/socket-two"));
        } finally {
            first.server().stop(0);
            second.server().stop(0);
        }
    }

    private static MatsFactory createMatsFactory(String appName, String nodeName) {
        MatsFactory.FactoryConfig factoryConfig = (MatsFactory.FactoryConfig) Proxy.newProxyInstance(
                Test_MatsSocketQuarkusFactory.class.getClassLoader(),
                new Class<?>[] { MatsFactory.FactoryConfig.class },
                new ConfigInvocationHandler(appName, nodeName));

        return (MatsFactory) Proxy.newProxyInstance(
                Test_MatsSocketQuarkusFactory.class.getClassLoader(),
                new Class<?>[] { MatsFactory.class },
                (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "getFactoryConfig":
                            return factoryConfig;
                        case "terminator":
                        case "subscriptionTerminator":
                        case "single":
                            applyConfigConsumers(args);
                            return createEndpointProxy();
                        case "getEndpoints":
                            return List.of();
                        case "getEndpoint":
                            return Optional.empty();
                        case "stop":
                        case "waitForReceiving":
                            return true;
                        case "start":
                        case "holdEndpointsUntilFactoryIsStarted":
                        case "close":
                            return null;
                        default:
                            return QuarkusTestSupport.defaultValue(method.getReturnType());
                    }
                });
    }

    private static void applyConfigConsumers(Object[] args) {
        if (args == null) {
            return;
        }
        if (args.length >= 4 && args[3] instanceof Consumer<?> endpointConfigConsumer) {
            @SuppressWarnings("unchecked")
            Consumer<MatsEndpoint.EndpointConfig<?, ?>> consumer =
                    (Consumer<MatsEndpoint.EndpointConfig<?, ?>>) endpointConfigConsumer;
            consumer.accept(createEndpointConfigProxy());
        }
        if (args.length >= 5 && args[4] instanceof Consumer<?> stageConfigConsumer) {
            @SuppressWarnings("unchecked")
            Consumer<MatsStage.StageConfig<?, ?, ?>> consumer =
                    (Consumer<MatsStage.StageConfig<?, ?, ?>>) stageConfigConsumer;
            consumer.accept(createStageConfigProxy());
        }
    }

    private static MatsEndpoint<?, ?> createEndpointProxy() {
        return (MatsEndpoint<?, ?>) Proxy.newProxyInstance(
                Test_MatsSocketQuarkusFactory.class.getClassLoader(),
                new Class<?>[] { MatsEndpoint.class },
                (proxy, method, args) -> QuarkusTestSupport.defaultValue(method.getReturnType()));
    }

    private static MatsEndpoint.EndpointConfig<?, ?> createEndpointConfigProxy() {
        return (MatsEndpoint.EndpointConfig<?, ?>) Proxy.newProxyInstance(
                Test_MatsSocketQuarkusFactory.class.getClassLoader(),
                new Class<?>[] { MatsEndpoint.EndpointConfig.class },
                new SimpleConfigInvocationHandler());
    }

    private static MatsStage.StageConfig<?, ?, ?> createStageConfigProxy() {
        return (MatsStage.StageConfig<?, ?, ?>) Proxy.newProxyInstance(
                Test_MatsSocketQuarkusFactory.class.getClassLoader(),
                new Class<?>[] { MatsStage.StageConfig.class },
                new SimpleConfigInvocationHandler());
    }

    private static ClusterStoreAndForward createClusterStoreAndForward() {
        return (ClusterStoreAndForward) Proxy.newProxyInstance(
                Test_MatsSocketQuarkusFactory.class.getClassLoader(),
                new Class<?>[] { ClusterStoreAndForward.class },
                (proxy, method, args) -> {
                    if ("boot".equals(method.getName())) {
                        return null;
                    }
                    if (method.getReturnType() == Optional.class) {
                        return Optional.empty();
                    }
                    if (method.getReturnType() == List.class) {
                        return List.of();
                    }
                    return QuarkusTestSupport.defaultValue(method.getReturnType());
                });
    }

    private static AuthenticationPlugin createAuthenticationPlugin() {
        return () -> new AuthenticationPlugin.SessionAuthenticator() {
            @Override
            public AuthenticationPlugin.AuthenticationResult initialAuthentication(
                    AuthenticationPlugin.AuthenticationContext context, String authorizationHeader) {
                return null;
            }

            @Override
            public AuthenticationPlugin.AuthenticationResult reevaluateAuthentication(
                    AuthenticationPlugin.AuthenticationContext context,
                    String authorizationHeader, java.security.Principal existingPrincipal) {
                return null;
            }
        };
    }

    private static class ConfigInvocationHandler implements java.lang.reflect.InvocationHandler {
        private final String appName;
        private final String nodeName;
        private final AtomicInteger concurrency = new AtomicInteger(2);
        private final AtomicInteger interactiveConcurrency = new AtomicInteger(2);
        private final Map<String, Object> attributes = new HashMap<>();

        ConfigInvocationHandler(String appName, String nodeName) {
            this.appName = appName;
            this.nodeName = nodeName;
        }

        @Override
        public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args) {
            switch (method.getName()) {
                case "getAppName":
                case "getName":
                    return appName;
                case "getNodename":
                    return nodeName;
                case "getConcurrency":
                    return concurrency.get();
                case "setConcurrency":
                    concurrency.set((Integer) args[0]);
                    return proxy;
                case "isConcurrencyDefault":
                    return false;
                case "getInteractiveConcurrency":
                    return interactiveConcurrency.get();
                case "setInteractiveConcurrency":
                    interactiveConcurrency.set((Integer) args[0]);
                    return proxy;
                case "isInteractiveConcurrencyDefault":
                    return false;
                case "isRunning":
                    return true;
                case "setAttribute":
                    attributes.put((String) args[0], args[1]);
                    return proxy;
                case "getAttribute":
                    return attributes.get(args[0]);
                case "setName":
                case "setNodename":
                case "setCommonEndpointGroupId":
                case "setInitiateTraceIdModifier":
                case "setMatsDestinationPrefix":
                case "setMatsTraceKey":
                case "installPlugin":
                    return proxy;
                case "getCommonEndpointGroupId":
                case "getMatsDestinationPrefix":
                case "getMatsTraceKey":
                case "getAppVersion":
                case "getSystemInformation":
                case "getMatsImplementationName":
                case "getMatsImplementationVersion":
                    return "";
                case "getPlugins":
                    return List.of();
                case "removePlugin":
                    return false;
                case "instantiateNewObject":
                    return null;
                case "getNumberOfCpus":
                    return 1;
                default:
                    return QuarkusTestSupport.defaultValue(method.getReturnType());
            }
        }
    }

    private static class SimpleConfigInvocationHandler implements java.lang.reflect.InvocationHandler {
        private final AtomicInteger concurrency = new AtomicInteger(1);
        private final AtomicInteger interactiveConcurrency = new AtomicInteger(1);
        private final Map<String, Object> attributes = new HashMap<>();

        @Override
        public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args) {
            switch (method.getName()) {
                case "getConcurrency":
                    return concurrency.get();
                case "setConcurrency":
                    concurrency.set((Integer) args[0]);
                    return proxy;
                case "isConcurrencyDefault":
                    return false;
                case "getInteractiveConcurrency":
                    return interactiveConcurrency.get();
                case "setInteractiveConcurrency":
                    interactiveConcurrency.set((Integer) args[0]);
                    return proxy;
                case "isInteractiveConcurrencyDefault":
                    return false;
                case "isRunning":
                    return true;
                case "setAttribute":
                    attributes.put((String) args[0], args[1]);
                    return proxy;
                case "getAttribute":
                    return attributes.get(args[0]);
                case "getOrigin":
                case "getEndpointId":
                case "getStageId":
                    return "";
                case "getStageIndex":
                case "getRunningStageProcessors":
                    return 0;
                case "getReplyClass":
                case "getStateClass":
                case "getIncomingClass":
                case "getProcessLambda":
                    return null;
                case "isSubscription":
                    return false;
                case "setOrigin":
                    return proxy;
                default:
                    return QuarkusTestSupport.defaultValue(method.getReturnType());
            }
        }
    }
}
