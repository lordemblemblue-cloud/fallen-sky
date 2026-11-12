export class CombatSystem {
  constructor({ calculateHit, getPlayerHUD, setHP, spawnDamageFloat, playActionSound } = {}) {
    this.calculateHit = calculateHit;
    this.getPlayerHUD = getPlayerHUD;
    this.setHP = setHP;
    this.spawnDamageFloat = spawnDamageFloat;
    this.playActionSound = playActionSound;
    this.hitPauseTimer = 0;
  }

  canAttack(cooldown) {
    return cooldown <= 0;
  }

  attack(attacker, target, data = {}) {
    if (!target || target.dying || target.alive === false) return 0;
    let damage = data.damage ?? data.amount ?? 1;
    const critChance = data.critChance ?? 0;
    const crit = Math.random() < critChance;
    if (crit) damage *= 1.5;
    return this.applyDamage(target, damage, { sourceId: data.sourceId ?? target.id, sound: data.sound, crit });
  }

  applyDamage(target, amount, {
    sourceId = target?.id, sound = 'enemy_hit', crit = false, lethal = false,
  } = {}) {
    if (!target || target.dying || target.alive === false) return 0;
    const damage = Math.max(1, Math.round(amount));
    target.hp = Math.max(0, target.hp - damage);
    target.hitCooldown = 0.25;
    // The combat resolver already decides critical/lethal status; presentation
    // uses that result and NEVER rolls a second critical or changes the amount.
    this.spawnDamageFloat?.(sourceId, damage, {
      kind: lethal ? 'lethal' : crit ? 'critical' : 'normal',
    });
    this.playActionSound?.(sound);
    this.hitPauseTimer = 0.04;
    if (target.hp <= 0) target.alive = false;
    return damage;
  }

  update(delta) {
    if (this.hitPauseTimer > 0) this.hitPauseTimer = Math.max(0, this.hitPauseTimer - delta);
  }
}
