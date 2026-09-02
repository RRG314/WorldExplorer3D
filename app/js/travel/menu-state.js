function resolveTravelMenuState({
  environment,
  earthEnvironment = 'EARTH',
  moonEnvironment = 'MOON',
  marsEnvironment = 'MARS',
  pathfinderStaged = false,
  supports = () => true
} = {}) {
  const onEarth = environment === earthEnvironment;
  const returningFromSurface = environment === moonEnvironment || environment === marsEnvironment;
  const spaceAvailable = supports('space') === true;

  return Object.freeze({
    ocean: Object.freeze({ visible: onEarth && supports('ocean') === true }),
    earth: Object.freeze({ visible: !onEarth && supports('earth') === true }),
    pathfinder: Object.freeze({
      visible: onEarth && spaceAvailable,
      label: pathfinderStaged ? '🛸 Pathfinder Ready Nearby' : '🛸 Deploy Pathfinder Pod'
    }),
    boardStarship: Object.freeze({
      visible: onEarth && spaceAvailable,
      label: '🛰️ Board Solis Reach Directly'
    }),
    freeSpaceFlight: Object.freeze({
      visible: onEarth && spaceAvailable,
      label: '✦ Enter Free Space Flight'
    }),
    quickTrip: Object.freeze({
      visible: spaceAvailable && (onEarth || returningFromSurface),
      label: returningFromSurface ? '🌍 Return to Earth' : '🌙 Quick Trip to the Moon'
    })
  });
}

export { resolveTravelMenuState };
