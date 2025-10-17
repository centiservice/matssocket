package io.mats3.matssocket.impl;

import java.io.IOException;
import java.io.StringWriter;
import java.util.List;
import java.util.function.Supplier;

import com.fasterxml.jackson.annotation.JsonAutoDetect.Visibility;
import com.fasterxml.jackson.annotation.JsonInclude.Include;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.util.TokenBuffer;
import com.fasterxml.jackson.datatype.jdk8.Jdk8Module;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import io.mats3.matssocket.MatsSocketServer.MatsSocketEnvelopeDto;
import io.mats3.matssocket.MatsSocketServer.MatsSocketEnvelopeWithMetaDto;
import io.mats3.matssocket.impl.MatsSocketStatics.MatsSocketEnvelopeDto_Mixin.DirectJson;

import org.slf4j.Logger;

/**
 * @author Endre Stølsvik 2020-01-15 08:38 - http://stolsvik.com/, endre@stolsvik.com
 */
public interface MatsSocketStatics {

    String MDC_SESSION_ID = "matssocket.sessionId";
    String MDC_PRINCIPAL_NAME = "matssocket.principal";
    String MDC_USER_ID = "matssocket.userId";

    String MDC_CLIENT_LIB_AND_VERSIONS = "matssocket.clientLib";
    String MDC_CLIENT_APP_NAME_AND_VERSION = "matssocket.clientApp";

    String MDC_MESSAGE_TYPE = "matssocket.msgType";
    String MDC_TRACE_ID = "traceId";
    String MDC_CMID = "matssocket.cmid";
    String MDC_SMID = "matssocket.smid";

    // Limits:
    int MAX_LENGTH_OF_TOPIC_NAME = 256;

    int MAX_NUMBER_OF_TOPICS_PER_SESSION = 1500;
    int MAX_NUMBER_OF_SESSIONS_PER_USER_ID = 75;
    int MAX_NUMBER_OF_RECORDED_ENVELOPES_PER_SESSION = 200;
    int MAX_NUMBER_OF_HELD_ENVELOPES_PER_SESSION = 100;
    int MAX_SIZE_OF_HELD_ENVELOPE_MSGS = 20 * 1024 * 1024;

    int MAX_NUMBER_OF_REDELIVERY_ATTEMPTS = 10;

    int MAX_NUMBER_OF_MESSAGES_PER_FORWARD_LOOP = 20;

    int MIN_FORWARDER_POOL_SIZE = 5;
    int MAX_FORWARDER_POOL_SIZE = 100;

    int MAX_NUMBER_OF_OUTBOX_STORE_ATTEMPTS_CSAF = 100;

    // For Incoming Send, Request and Reply handling, if "VERY BAD!" occurs.
    int MAX_NUMBER_OF_COMPENSATING_TRANSACTIONS_ATTEMPTS = 60; // 60 * 250ms = 15 seconds.
    int MILLIS_BETWEEN_COMPENSATING_TRANSACTIONS_ATTEMPTS = 250;

    // Constants:
    long MILLIS_BETWEEN_LIVELINESS_UPDATE_RUN = 54 * 1000; // <One minute (54 sec + Random(10%))
    long MILLIS_BETWEEN_SESSION_TIMEOUT_RUN = 5 * 60 * 1000; // Five minutes
    long MILLIS_BETWEEN_SCAVENGE_SESSION_REMNANTS_RUN = 90 * 60 * 1000; // 1.5 hours
    // Sessions times out if last liveliness was three days ago
    Supplier<Long> MILLIS_SESSION_TIMEOUT_SUPPLIER = () -> System.currentTimeMillis() - 3 * 24 * 60 * 60 * 1000L;

    int NUMBER_OF_OUTGOING_ENVELOPES_SCHEDULER_THREADS = Runtime.getRuntime().availableProcessors();

    String THREAD_PREFIX = "MatsSocket:";

    default double ms(long nanos) {
        return Math.round(nanos / 10_000d) / 1_00d;
    }

    default double msSince(long nanosStart) {
        return ms(System.nanoTime() - nanosStart);
    }

    class DebugStackTrace extends Exception {
        public DebugStackTrace(String what) {
            super("Debug Stacktrace to record where " + what + " happened.");
        }
    }

    /**
     * If the msg field is a DirectJson or a TokenBuffer, it will be converted to a String.
     *
     * @param envelopes
     *            a list of envelopes, where the message field can be a String, DirectJson, or a TokenBuffer.
     * @param log
     *            a logger, for logging the error.
     * @return the same list, but with the msg field set to a String if it is a String JSON.
     */
    default void ensureMsgFieldIsJsonString_ForIntrospection(
            List<MatsSocketEnvelopeWithMetaDto> envelopes, Logger log, ObjectMapper jackson) {
        for (MatsSocketEnvelopeWithMetaDto envelope : envelopes) {
            // Convert the msg field to a String if it is a DirectJson or a TokenBuffer.
            if (envelope.msg instanceof String) {
                // do nothing.
            }
            else if (envelope.msg instanceof DirectJson) {
                envelope.msg = ((DirectJson) envelope.msg).getJson();
            }
            else if (envelope.msg instanceof TokenBuffer) {
                StringWriter writer = new StringWriter(128);
                try (JsonParser bufferParser = ((TokenBuffer) envelope.msg).asParserOnFirstToken();
                        JsonGenerator gen = jackson.getFactory().createGenerator(writer)) {
                    gen.copyCurrentStructure(bufferParser);
                }
                catch (IOException e) {
                    log.error("Got IOException when trying to copy TokenBuffer to StringWriter - ignoring by setting" +
                            "to null, since this is only for introspection.", e);
                }
                envelope.msg = writer.toString();
            }
            else if (envelope.msg != null) {
                log.error("THIS IS AN ERROR! If the envelope.msg field is set, it should be a String, DirectJson or" +
                        " TokenBuffer, but it is [" + envelope.msg.getClass().getName() + "]",
                        new RuntimeException("Debug Stacktrace! Wrong type of msg field in envelope: " + envelope.msg));
            }
        }
    }

    default ObjectMapper createNewJacksonMapper() {
        /*
         * NOTE: This following is stolen directly from util.FieldBasedJacksonMapper - uses same serialization setup,
         * EXCEPT also adding the mixin for MatsSocketEnvelopeDto!
         *
         * NOTE: We DO NOT (currently) use the FieldBasedJacksonMapper, to avoid dependency on Mats3's util lib, so
         * we instead use the same-ish setup.
         */
        ObjectMapper mapper = new ObjectMapper();

        // Read and write any access modifier fields (e.g. private)
        mapper.setVisibility(PropertyAccessor.ALL, Visibility.NONE);
        mapper.setVisibility(PropertyAccessor.FIELD, Visibility.ANY);

        // Drop nulls
        // TODO: Use NON_ABSENT:  // Drop nulls and Optional.empty()
        mapper.setSerializationInclusion(Include.NON_NULL);

        // If props are in JSON that aren't in Java DTO, do not fail.
        mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        // Write e.g. Dates as "1975-03-11" instead of timestamp, and instead of array-of-ints [1975, 3, 11].
        // Uses ISO8601 with milliseconds and timezone (if present).
        mapper.registerModule(new JavaTimeModule());
        mapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);

        // Handle Optional, OptionalLong, OptionalDouble
        mapper.registerModule(new Jdk8Module());

        /*
         * ###### NOTICE! The following part is special for the MatsSocket serialization setup! ######
         */

        //
        // Creating a Mixin for the MatsSocketEnvelopeDto, handling the "msg" field specially:
        //
        // 1) Upon deserialization, deserializes the "msg" field as "pure JSON", i.e. a String containing JSON
        // 2) Upon serialization, serializes the msg field normally (i.e. an instance of Car is JSON serialized),
        // 3) .. UNLESS it is the special type DirectJsonMessage, in which case the JSON is output directly
        //
        mapper.addMixIn(MatsSocketEnvelopeDto.class, MatsSocketEnvelopeDto_Mixin.class);

        return mapper;
    }

    @JsonPropertyOrder({ "t", "smid", "cmid", "x", "ids", "tid", "auth" })
    class MatsSocketEnvelopeDto_Mixin extends MatsSocketEnvelopeWithMetaDto {
        @JsonDeserialize(using = MessageToTokenBufferDeserializer.class)
        @JsonSerialize(using = DirectJsonMessageHandlingDeserializer.class)
        public Object msg; // Message, JSON

        /**
         * A {@link MatsSocketEnvelopeWithMetaDto} will be <i>Deserialized</i> (made into object) with the "msg" field
         * directly to the JSON that is present there, represented via a {@link TokenBuffer}, using this class.
         */
        static class MessageToTokenBufferDeserializer extends JsonDeserializer<Object> {
            @Override
            public Object deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
                // Been through three solutions now, trying to avoid creating intermediate JsonNode and String objects.
                // Ref: https://chatgpt.com/share/68f12369-a860-8009-9540-a577e6b10349
                // First solution was as such:
                // return p.readValueAsTree().toString();
                //
                // Second solution as such:
                //  TokenBuffer buffer = ctxt.bufferAsCopyOfValue(p);
                //  StringWriter writer = new StringWriter(128);
                //  try (JsonParser bufferParser = buffer.asParserOnFirstToken();
                //          JsonGenerator gen = p.getCodec().getFactory().createGenerator(writer)){
                //      gen.copyCurrentStructure(bufferParser);
                //  }
                //  return writer.toString();

                if (p.currentToken() == JsonToken.VALUE_NULL) {
                    return null;
                }

                // Store the incoming JSON as the "raw tokens" TokenBuffer, for conversion to incoming DTO when needed.
                return ctxt.bufferAsCopyOfValue(p);
            }
        }

        /**
         * A {@link MatsSocketEnvelopeWithMetaDto} will be <i>Serialized</i> (made into a JSON String) with the "msg" field
         * handled specially: If it is any other class than {@link DirectJson} or {@link TokenBuffer}, default handling ensues (JSON object
         * serialization). If it is DirectJson, it will output the (JSON) String it contains directly. If it is a
         * TokenBuffer, which happens when deserializing a message from the CSAF (see above for deserializing), and we just
         * want to serialize it again, then we just output the tokens directly.
         */
        static class DirectJsonMessageHandlingDeserializer extends JsonSerializer<Object> {
            @Override
            public void serialize(Object value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
                // ?: Is it our special magic String-wrapper that will contain direct JSON?
                if (value instanceof DirectJson) {
                    // -> Yes, special magic String-wrapper, so dump it directly.
                    gen.writeRawValue(((DirectJson) value).getJson());
                } else if (value instanceof TokenBuffer) {
                    // -> Yes, TokenBuffer, so just output the tokens.
                    ((TokenBuffer) value).serialize(gen);
                } else {
                    // -> No, not magic, so serialize it normally.
                    gen.writeObject(value);
                }
            }
        }

        /**
         * If the {@link MatsSocketEnvelopeWithMetaDto#msg}-field is of this magic type, the String it contains - which then
         * needs to be proper JSON - will be output directly. Otherwise, it will be JSON serialized.
         */
        static class DirectJson {
            private final String _json;

            public static DirectJson of(String msg) {
                if (msg == null) {
                    return null;
                }
                return new DirectJson(msg);
            }

            private DirectJson(String json) {
                _json = json;
            }

            public String getJson() {
                return _json;
            }
        }
    }

    /**
     * When trying to send messages over WebSocket and get an IOException, we do not have many options of handling - the
     * socket has probably closed.
     */
    class SocketSendIOException extends RuntimeException {
        public SocketSendIOException(IOException cause) {
            super("Got problems sending message over WebSocket", cause);
        }
    }
}
