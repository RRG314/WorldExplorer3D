// UI sends intent; the transport owner resolves and admits a ground arrival.
export function bindSurfaceRecoveryControls(ctx, closeMenus = () => {}) {
  for (const [id,random] of [['fRespawn',false],['fRespawnRand',true]]) {
    document.getElementById(id)?.addEventListener('click',() => {
      ctx.recoverSurfaceTravel?.({random,source:random ? 'random_ground_recovery' : 'safe_ground_recovery'});
      closeMenus();
    });
  }
}
