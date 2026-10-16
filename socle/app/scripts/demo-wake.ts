/**
 * Réveil du serveur de démo : un service Render gratuit s'endort après 15 minutes sans visite et met
 * environ une minute à se réveiller.
 *
 *   DEMO_URL=https://… pnpm demo:wake               réveille la démo et attend qu'elle réponde
 *   DEMO_URL=https://… pnpm demo:wake --garder 180  puis la garde éveillée 180 minutes
 *
 * À lancer 10 minutes avant la présentation, avec --garder pour sa durée.
 * Origine : egm-app `scripts/demo-wake.ts`.
 */
if (!process.env.DEMO_URL) {
  console.error("DEMO_URL manquant : adresse de la démo, par exemple https://mon-app.onrender.com");
  process.exit(2);
}
const url = `${process.env.DEMO_URL}/connexion`;
const keepIndex = process.argv.indexOf("--garder");
const keepMinutes = keepIndex > 0 ? Number(process.argv[keepIndex + 1]) : 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ping(): Promise<number> {
  const started = Date.now();
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(90_000) });
  if (response.status !== 200) throw new Error(`réponse ${response.status}`);
  return Date.now() - started;
}

async function main() {
  console.log(`Réveil de ${url}…`);
  const deadline = Date.now() + 4 * 60_000;
  for (let attempt = 1; ; attempt++) {
    try {
      const ms = await ping();
      console.log(`Prêt (${(ms / 1000).toFixed(1)} s).`);
      break;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`Le serveur ne répond pas après 4 minutes (${String(error)}). Voir le tableau de bord Render.`);
      console.log(`  tentative ${attempt} : pas encore (${error instanceof Error ? error.message : error}), nouvel essai dans 10 s`);
      await sleep(10_000);
    }
  }
  if (keepMinutes > 0) {
    const end = Date.now() + keepMinutes * 60_000;
    console.log(`Gardé éveillé ${keepMinutes} minutes (Ctrl+C pour arrêter).`);
    while (Date.now() < end) {
      await sleep(5 * 60_000);
      try {
        const ms = await ping();
        console.log(`${new Date().toLocaleTimeString("fr-FR")} : répond (${(ms / 1000).toFixed(1)} s)`);
      } catch (error) {
        console.log(`${new Date().toLocaleTimeString("fr-FR")} : pas de réponse (${String(error)})`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
