// @ts-check
import * as Mats from 'matssocket';

document.getElementById('out').textContent =
    'Keys: ' + JSON.stringify(Object.keys(Mats), null, 2);

console.log('matssocket imported (JS)', Mats);
