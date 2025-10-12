'use client';
import * as matssocket from 'matssocket';

export default function Page() {
    return (
        <pre style={{ whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(Object.keys(matssocket), null, 2)}
    </pre>
    );
}
