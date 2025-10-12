import {createRoot} from 'react-dom/client';
import App from './App';
import * as matssocket from 'matssocket';

createRoot(document.getElementById('root')!).render(<App/>);

let matsSocket = new matssocket.MatsSocket("TestApp", "1.2.3",
    ['ws://localhost:8080/matssocket', 'ws://localhost:8081/matssocket']);
matsSocket.preconnectoperation = true;
matsSocket.logging = true;
matsSocket.debug = matssocket.DebugOption.TIMESTAMPS | matssocket.DebugOption.NODES;
matsSocket.setCurrentAuthorization("Nothing");
matsSocket.close("Goodbye");
