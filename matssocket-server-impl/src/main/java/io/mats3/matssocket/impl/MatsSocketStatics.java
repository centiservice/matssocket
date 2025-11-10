package io.mats3.matssocket.impl;

import java.io.IOException;
import java.io.StringWriter;
import java.util.List;
import java.util.function.Supplier;

import org.slf4j.Logger;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

import io.mats3.matssocket.MatsSocketServer.MatsSocketEnvelopeDto;
import io.mats3.matssocket.MatsSocketServer.MatsSocketEnvelopeWithMetaDto;
import io.mats3.matssocket.impl.MatsSocketStatics.MatsSocketEnvelopeDto_Mixin.DirectJson;

import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonGenerator;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.ValueSerializer;
import tools.jackson.databind.annotation.JsonDeserialize;
import tools.jackson.databind.annotation.JsonSerialize;
import tools.jackson.databind.cfg.DateTimeFeature;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.util.TokenBuffer;

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

    // The ping standard endpoints.
    String MATS_SOCKET_MATS_PING = "MatsSocket.matsPing";
    String MATS_SOCKET_MATS_SOCKET_PING = "MatsSocket.matsSocketPing";

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
     */
    default void ensureMsgFieldIsJsonString_ForIntrospection(
            List<MatsSocketEnvelopeWithMetaDto> envelopes, Logger log, ObjectMapper mapper) {
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
                try (JsonGenerator g = mapper.createGenerator(writer)) {
                    ((TokenBuffer) envelope.msg).serialize(g);
                    envelope.msg = writer.toString();
                }
                catch (JacksonException e) {
                    log.error("Got IOException when trying to copy TokenBuffer to StringWriter - ignoring by setting" +
                            "to null, since this is only for introspection.", e);
                    envelope.msg = null;
                }
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

        // Much larger constraints, and make max string length effectively infinite.
        StreamReadConstraints streamReadConstraints = StreamReadConstraints
                .builder()
                .maxNestingDepth(10_000) // default 1000 (from 3.0: 500)
                .maxNumberLength(100_000) // default 1000
                .maxStringLength(Integer.MAX_VALUE)
                .build();
        JsonFactory factory = JsonFactory.builder()
                .streamReadConstraints(streamReadConstraints)
                .build();

        JsonMapper.Builder builder = JsonMapper.builder(factory);

        // Drop null values from JSON
        // NOTE: We will not use NON_DEFAULT here, due to JavaScript integration (0 or false would be undefined).
        builder.changeDefaultPropertyInclusion(incl -> incl.withValueInclusion(JsonInclude.Include.NON_NULL));
        // Read and write any access modifier fields (e.g. private)
        builder.changeDefaultVisibility(vc -> vc.with(JsonAutoDetect.Visibility.NONE).withFieldVisibility(JsonAutoDetect.Visibility.ANY));
        // Allow final fields to be written to.
        builder.enable(MapperFeature.ALLOW_FINAL_FIELDS_AS_MUTATORS);

        // If props are in JSON that aren't in Java DTO, do not fail.
        builder.disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

        // :: Dates:
        // Write times and dates using Strings of ISO-8601.
        builder.disable(DateTimeFeature.WRITE_DATES_AS_TIMESTAMPS);
        // Tack on "[Europe/Oslo]" if present in a ZoneDateTime
        builder.enable(DateTimeFeature.WRITE_DATES_WITH_ZONE_ID);
        // Do not OVERRIDE (!!) the timezone id if it actually is present!
        builder.disable(DateTimeFeature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE);

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
        builder.addMixIn(MatsSocketEnvelopeDto.class, MatsSocketEnvelopeDto_Mixin.class);

        return builder.build();
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
        static class MessageToTokenBufferDeserializer extends ValueDeserializer<Object> {
            @Override
            public Object deserialize(JsonParser p, DeserializationContext ctxt) {
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
        static class DirectJsonMessageHandlingDeserializer extends ValueSerializer<Object> {
            @Override
            public void serialize(Object value, JsonGenerator gen, SerializationContext serializers) {
                // ?: Is it our special magic String-wrapper that will contain direct JSON?
                if (value instanceof DirectJson) {
                    // -> Yes, special magic String-wrapper, so dump it directly.
                    gen.writeRawValue(((DirectJson) value).getJson());
                } else if (value instanceof TokenBuffer) {
                    // -> Yes, TokenBuffer, so just output the tokens.
                    ((TokenBuffer) value).serialize(gen);
                } else {
                    // -> No, not magic, so serialize it normally.
                    gen.writePOJO(value);
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
