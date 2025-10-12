'use client';

import {useEffect, useRef, useState} from 'react';
import * as matssocket from 'matssocket';

export default function Page() {
    const msRef = useRef<matssocket.MatsSocket | null>(null);
    const [apiKeys, setApiKeys] = useState<string>('(loading…)');

    useEffect(() => {
        setApiKeys(JSON.stringify(Object.keys(matssocket), null, 2));

        // Create once on mount
        const ms = new matssocket.MatsSocket(
            "TestApp",
            "1.2.3",
            ['ws://localhost:8080/matssocket', 'ws://localhost:8081/matssocket']
        );
        msRef.current = ms;

        ms.preconnectoperation = true;
        ms.logging = true;
        ms.debug = matssocket.DebugOption.TIMESTAMPS | matssocket.DebugOption.NODES;
        ms.setCurrentAuthorization("Nothing");

        console.log('matssocket module:', matssocket);
        console.log('MatsSocket instance:', ms);

        return () => {
            try {
                ms.close("Goodbye");
            }
            catch {
            }
            msRef.current = null;
        };
    }, []);

    return (
        <span>
            <h1>Next.js + MatsSocket using TypeScript</h1>
            <div style={{fontFamily: 'monospace', whiteSpace: 'pre-wrap'}}>
                {apiKeys}
            </div>
        </span>
    );
}
