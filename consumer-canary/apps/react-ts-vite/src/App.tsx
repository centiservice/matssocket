import * as Mats from 'matssocket';

export default function App() {
    return (
        <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {'matssocket keys:\n' + JSON.stringify(Object.keys(Mats), null, 2)}
        </div>
    );
}