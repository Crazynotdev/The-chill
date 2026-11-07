# Assets du ticket

| Fichier | Rôle |
|---|---|
| `source-poster-red.png` | Affiche officielle (rouge) — source du fond du ticket. |
| `source-poster-purple.png` | Affiche officielle (violette) — conservée pour la communication, non utilisée sur le ticket. |
| `ticket-background.jpg` | **Fond réellement utilisé par le PDF** (600 × 320 pt). Généré depuis l'affiche. |

Régénérer le fond (après changement d'affiche) :

```bash
npm i -D sharp            # une fois
node scripts/build-ticket-background.js [chemin/vers/affiche.png]
```

Textes organisateur / sponsor et préfixe de code : `lib/pdf/branding.ts`.
Couleurs de l'interface : variables `:root` dans `app/globals.css`.
