import * as matssocket from 'matssocket';

export default function App() {
    return (
        <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {'matssocket keys:\n' + JSON.stringify(Object.keys(matssocket), null, 2)}
        </div>
    );
}