// The small ZScript runtime every HellForge game ships with. Block code calls into this.
export const HF_LIB = `// HellForge runtime helpers. Everything is null-safe so block scripts can never crash the game.
class HF play
{
	static Actor Plr(Actor a)
	{
		if (a)
		{
			if (a.player) return a;
			if (a.target && a.target.player) return a.target;
		}
		for (int i = 0; i < MAXPLAYERS; i++)
		{
			if (playeringame[i] && players[i].mo) return players[i].mo;
		}
		return null;
	}
	static Actor Tgt(Actor me, Actor plr) { return (me && me.target) ? me.target : plr; }
	static int Tics(double secs) { return max(1, int(secs * 35)); }
	static double Rnd(double a, double b)
	{
		if (a > b) { double t = a; a = b; b = t; }
		if (a == floor(a) && b == floor(b)) return random(int(a), int(b));
		return frandom(a, b);
	}
	static double Div(double a, double b) { return b == 0 ? 0 : a / b; }
	static void Say(String s) { Console.MidPrint(smallfont, s, true); }
	static void Snd(Actor me, Sound s)
	{
		if (me) me.A_StartSound(s, CHAN_AUTO);
		else S_StartSound(s, CHAN_AUTO);
	}
	static Actor Spawn(Actor me, class<Actor> cls, int where)
	{
		if (!me || !cls) return null;
		Vector3 p = me.pos;
		if (where == 1) p = me.Vec3Angle(me.radius + 48, me.angle, 8);
		else if (where == 2) p = me.pos + (0, 0, me.height + 16);
		Actor a = Actor.Spawn(cls, p, ALLOW_REPLACE);
		if (a)
		{
			a.angle = me.angle;
			if (a.bIsMonster && !a.TestMobjLocation()) { a.ClearCounters(); a.Destroy(); return null; }
		}
		return a;
	}
	static Actor SpawnAtSpot(class<Actor> cls, int tid)
	{
		if (!cls || tid == 0) return null;
		ActorIterator it = level.CreateActorIterator(tid);
		Actor spot, last = null;
		while (spot = it.Next())
		{
			last = Actor.Spawn(cls, spot.pos, ALLOW_REPLACE);
			if (last)
			{
				last.angle = spot.angle;
				Actor.Spawn("TeleportFog", spot.pos, ALLOW_REPLACE);
			}
		}
		return last;
	}
	static void Special(Actor who, int special, int a1 = 0, int a2 = 0, int a3 = 0, int a4 = 0, int a5 = 0)
	{
		level.ExecuteSpecial(special, who, null, false, a1, a2, a3, a4, a5);
	}
	static void Give(Actor who, class<Inventory> item, double n) { if (who && item && n >= 1) who.GiveInventory(item, int(n)); }
	static void Take(Actor who, class<Inventory> item, double n) { if (who && item && n >= 1) who.TakeInventory(item, int(n)); }
	static double Count(Actor who, class<Inventory> item) { return (who && item) ? who.CountInv(item) : 0; }
	static void Heal(Actor who, double n) { if (who && who.health > 0 && n > 0) who.GiveBody(int(n)); }
	static void Hurt(Actor who, Actor by, double n) { if (who && who.health > 0 && n > 0) who.DamageMobj(by, by, int(n), 'None'); }
	static double Hp(Actor a) { return a ? a.health : 0; }
	static bool Alive(Actor a) { return a && a.health > 0; }
	static double Dist(Actor a, Actor b) { return (a && b) ? a.Distance3D(b) : 99999; }
	static bool Sees(Actor a, Actor b) { return a && b && a != b && a.CheckSight(b); }
	static Actor Shoot(Actor me, class<Actor> cls, Actor at)
	{
		if (!me || !cls) return null;
		Actor m;
		if (at && at != me) m = me.SpawnMissile(at, cls);
		else m = me.SpawnMissileAngle(cls, me.angle, 0);
		if (m && me.bMissile && me.target) m.target = me.target;
		return m;
	}
	static void Bullets(Actor me, Actor plr, double n, double dmg, double spread)
	{
		if (!me) return;
		int fl = CBAF_NORANDOM;
		if (!me.target)
		{
			if (plr && plr != me) me.A_Face(plr);
			fl |= CBAF_AIMFACING;
		}
		me.A_CustomBulletAttack(spread, spread * 0.5, int(n), int(dmg), "BulletPuff", 0, fl);
	}
	static void Melee(Actor me, double dmg) { if (me && me.target) me.A_CustomMeleeAttack(int(dmg)); }
	static void Boom(Actor me, double dmg, double r) { if (me) me.A_Explode(int(dmg), int(r), me.player ? 0 : XF_HURTSOURCE); }
	static void Kill(Actor me) { if (me && me.health > 0) me.DamageMobj(null, null, 1000000, 'None', DMG_FORCED); }
	static void Remove(Actor me) { if (me && !me.player) { me.ClearCounters(); me.Destroy(); } }
	static void SetHealth(Actor me, double n)
	{
		if (!me) return;
		if (n <= 0) { Kill(me); return; }
		me.health = int(n);
		if (me.player) me.player.health = int(n);
	}
	static void Flag(Actor me, int f, bool on)
	{
		if (!me) return;
		switch (f)
		{
		case 0: me.bInvulnerable = on; break;
		case 1: me.bNoClip = on; break;
		case 2: me.bNoGravity = on; if (me.bIsMonster) me.bFloat = on; break;
		case 3: me.bFriendly = on; break;
		case 4: me.bSolid = on; break;
		case 5: me.bShootable = on; break;
		case 6: me.bInvisible = on; break;
		case 7: me.bBright = on; break;
		case 8: me.bDormant = on; break;
		}
	}
	static void Jump(Actor me, double n) { if (me) me.vel.z += n; }
	static void Dash(Actor me, double n) { if (me) me.Thrust(n, me.angle); }
	static void Face(Actor me, Actor at) { if (me && at && me != at) me.A_Face(at); }
	static void Turn(Actor me, double n) { if (me) me.A_SetAngle(me.angle + n, SPF_INTERPOLATE); }
	static void SetSpeed(Actor me, double n)
	{
		if (!me) return;
		me.speed = n;
		if (me.bMissile && me.vel.Length() > 0) me.vel = me.vel.Unit() * n;
	}
	static void Tele(Actor who, int tid)
	{
		if (!who || tid == 0) return;
		ActorIterator it = level.CreateActorIterator(tid);
		Actor spot = it.Next();
		if (spot) who.Teleport(spot.pos, spot.angle, TELF_SOURCEFOG | TELF_DESTFOG);
	}
	static void Push(Actor who, Actor from, double n)
	{
		if (!who) return;
		if (from && from != who) who.Thrust(n, from.AngleTo(who));
		else who.Thrust(n, who.angle + 180);
	}
	static void Size(Actor me, double pct) { if (me) me.scale = GetDefaultByType(me.GetClass()).scale * (pct / 100.); }
	static void Fade(Actor me, double pct) { if (me) me.A_SetRenderStyle(clamp(pct / 100., 0., 1.), STYLE_Translucent); }
	static void Quake(Actor who, double power, double secs) { if (who) who.A_Quake(clamp(power, 1, 9), Tics(secs), 0, 2048, ""); }
	static bool InTag(Actor a, int tag)
	{
		if (!a || !a.CurSector || tag == 0) return false;
		int idx = a.CurSector.Index();
		SectorTagIterator it = level.CreateSectorTagIterator(tag);
		int i;
		while ((i = it.Next()) >= 0)
		{
			if (i == idx) return true;
		}
		return false;
	}
}
`;
