import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { Rooms } from '../src/realtime/rooms.js';

test('rooms: re-opening a direct chat during the reconnect grace keeps the room', async () => {
    const io = { sockets: { sockets: new Map() }, to: () => ({ emit() {} }) };
    const rooms = new Rooms({ io, graceMs: 20 });
    const sock = (id, email) => ({ id, data: { email }, join() {}, leave() {} });
    const a1 = sock('a1', 'a@x');
    const room = rooms.joinDirect('a@x', a1, 'b@x');
    rooms.joinDirect('b@x', sock('b1', 'b@x'), 'a@x');
    rooms.dropSocket(a1);                               // a reloads the page
    rooms.joinDirect('a@x', sock('a2', 'a@x'), 'b@x');  // ...and opens the chat again
    await sleep(60);
    assert.equal(rooms.rooms.has(room.id), true);
});
