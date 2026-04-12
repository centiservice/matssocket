package io.mats3.matssocket.impl;

/**
 * Transport-facing session handler contract used by external transports (e.g. Quarkus) to avoid depending on
 * implementation classes directly.
 *
 * @author Thor Egil Kolltveit 2026-04-12 - thoregil@kolltveit.org
 */
public interface MatsSocketTransportHandler {
    void onMessage(String message);

    void setMDC();

    String getMatsSocketSessionId();

    void closeSession(Integer closeCode, String reason);

    void deregisterSession(Integer closeCode, String reason);
}
