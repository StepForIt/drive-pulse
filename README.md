# Drive Pulse

Toutes les heures, résume ce qui a bougé dans un dossier Google Drive et dépose ce résumé dans un repo **privé**.

```
Ce repo (public, minutes Actions gratuites)
   │  cron toutes les heures
   ▼
Lit le Drive via Nango ──► écrit pulse.md dans StepForIt/wappe (branche drive-pulse, privée)
```

**Aucune donnée ici** : ni résumé, ni nom de fichier, ni identifiant. Les logs n'affichent que des compteurs.

## Secrets à poser (Settings → Secrets and variables → Actions)

| Secret | Contenu |
|---|---|
| `WAPPE_PULSE_TOKEN` | Token fine-grained : repo `StepForIt/wappe` seulement, permission *Contents: Read and write* |
| `NANGO_HOST`, `NANGO_SECRET_KEY`, `NANGO_CONNECTION_ID`, `NANGO_PROVIDER_CONFIG_KEY` | Les mêmes que dans wappe |
| `PULSE_ROOT_ID` | Dossier racine suivi |
| `PULSE_PINNED` | Documents dont la fin est recopiée (séparés par des virgules) |
| `PULSE_WATCH` | Fichiers suivis hors du dossier racine (optionnel) |
| `PULSE_IGNORE_DIRS`, `PULSE_IGNORE_AUTHORS` | Optionnels |

Les identifiants sont en secrets, pas en variables : GitHub masque les secrets dans les logs, pas les variables.

## Règles

1. Le résultat part dans wappe, jamais dans ce repo.
2. Aucun identifiant en dur dans le code.
3. Personne d'autre que les owners en écriture ici.
