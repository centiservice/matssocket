'use client';
import * as Mats from 'matssocket';

export default function Page() {
    return (
        <pre style={{ whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(Object.keys(Mats), null, 2)}
    </pre>
    );
}
