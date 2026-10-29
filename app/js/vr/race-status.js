// Read the existing race controller. No HUD clock or separate race state.
export function vrRaceStatus(context) {
 const run=context.roadRaceController,s=run?.snapshot?.();
 if(!s||!['countdown','running','complete'].includes(s.phase))return null;
 const player=s.players.find(p=>p.uid===run.uid);
 if(!player)return null;
 const elapsed=Math.max(0,player.progress?.elapsedMs??s.serverAtMs-(s.startAtMs||s.serverAtMs));
 const time=`${Math.floor(elapsed/60000)}:${(Math.floor(elapsed%60000/100)/10).toFixed(1).padStart(4,'0')}`;
 if(s.phase==='complete')return {resultsReady:true,primaryLabel:'Results',message:player.dnf?'Race ended · Look at Results':`Finished · ${time} · Place ${player.position}/${s.players.length}`};
 if(s.phase==='countdown')return {resultsReady:false,message:`Race starts in ${Math.max(1,Math.ceil((s.startAtMs-s.serverAtMs)/1000))} · Look at Start when ready`};
 if(player.progress?.finished)return {resultsReady:false,message:`Finished · ${time} · Waiting for other drivers`};
 return {resultsReady:false,message:`Race · ${player.position}/${s.players.length} · ${time} · Lap ${player.progress?.lap||1}/${s.laps} · Gate ${Math.min((player.progress?.nextGate||0)+1,run.course.gates.length)}/${run.course.gates.length}`};
}
