import { Actor } from 'base44:runtime/actors';
import { DuelistRoomEngine } from '../src/components/duelist/net/actorRoomEngine.mjs';
export default class DuelistArena extends Actor {
  static callable=['status'];
  static options={hibernate:false};
  tickIntervalMs=17;
  handleStart(){
    this.engine=new DuelistRoomEngine(this.instanceId);
    // Match state is deliberately ephemeral. Reconnect attached clients on a runtime restart.
    for(const conn of this.getConnections())conn.reject(1012,'Room restarted');
  }
  handleConnect(conn){this.engine.connect(conn);}
  handleMessage(conn,msg){this.engine.message(conn,msg);}
  handleClose(conn){this.engine.remove(conn.id);}
  shouldTick(){return !!this.engine?.shouldTick();}
  handleTick(){this.engine.tick();}
  status(){return {protocol:14,room:this.engine.status()};}
}

