// @ts-check
import * as matssocket from 'matssocket';

document.getElementById('out').textContent =
    'Keys: ' + JSON.stringify(Object.keys(matssocket), null, 2);

console.log('matssocket imported (JS)', matssocket);

let matsSocket = new matssocket.MatsSocket("TestApp", "1.2.3",
    ['ws://localhost:8080/matssocket', 'ws://localhost:8081/matssocket']);
matsSocket.preconnectoperation = true;
matsSocket.logging = true;
matsSocket.debug = matssocket.DebugOption.TIMESTAMPS | matssocket.DebugOption.NODES;
matsSocket.setCurrentAuthorization("Nothing");
matsSocket.close("Goodbye");

