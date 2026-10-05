# RobotVacuumLab SEO Agent — V1 gratuite

Ce prototype est un agent déterministe Python, sans API payante, et non une IA capable de tout rédiger seule.

## Installation

1. Fusionner la PR d'installation après lecture. Les workflows ne deviennent quotidiens qu'une fois présents sur la branche par défaut.
2. Dans Settings → Actions → General, autoriser GitHub Actions à créer des Pull Requests. Les permissions nécessaires sont déclarées dans le workflow. Aucun PAT n'est nécessaire pour les exécutions quotidiennes.
3. Actions → SEO Agent → Run workflow pour le premier audit. Télécharger `seo-audit` ou lire le résumé d'exécution.
4. Le planning est 10:23 UTC chaque jour, sous réserve des délais GitHub. Les workflows planifiés des dépôts publics inactifs peuvent être désactivés par GitHub.

## Fonctions livrées

- Audit des titles, descriptions, H1, canonicals, langue, images sans alt, liens HTML internes, ancres, CSS/JS/images locaux, JSON-LD syntaxique, doublons, pages orphelines et sitemap.
- Rapport Markdown et JSON, conservé 3 jours dans Actions.
- Ajout des pages existantes au sitemap uniquement si canonical exact et pas de meta noindex; PR dédiée, jamais de merge automatique.
- Comparaison des erreurs bloquantes avec la base de chaque PR. Les problèmes hérités restent dans le rapport; les nouveaux problèmes détectables bloquent.
- Tests du script avant modifications.

## Exécution locale

Depuis la racine du dépôt, avec Python 3.12 :

```bash
python3 tools/seo-agent/agent.py
python3 -m unittest discover -s tools/seo-agent -p 'test_*.py'
python3 tools/seo-agent/agent.py --gsc-csv /chemin/prive/Queries.csv
```

Export Search Console : Performance → Résultats de recherche → 3 mois → Exporter CSV, puis utiliser le fichier Queries.csv exporté en anglais. Ne pas publier de données privées dans le dépôt public. L'intégration API GSC/GA4 n'est pas encore connectée. La priorité est une heuristique impressions × intention / position, pas une prévision de ROI ou un volume de marché.

## Travail éditorial avec Codex

Utiliser CONTENT-PROMPT.md dans Codex sur ce dépôt pour créer une branche de travail. La rédaction dans votre session dépend de votre abonnement et de ses limites; ce workflow ne consomme aucun crédit LLM.

La génération quotidienne autonome de contenu nécessite un modèle local installé sur une machine disponible, ou une API avec quota/coût. Aucun n'est installé par cette V1. L'analyse concurrentielle et SERP n'est pas automatisée ici.

## Limites à connaître

L'audit porte sur les fichiers HTML, pas sur un navigateur, les réponses HTTP, les liens externes, les assets injectés par JS, les directives robots complètes, les données structurées Google, les Core Web Vitals ou l'indexation réelle. Une vérification Google ne doit jamais être supprimée pour passer l'audit. Les dates lastmod ne sont jamais actualisées sans changement éditorial réel.

GITHUB_TOKEN ne déclenche généralement pas les workflows sur les PR qu'il crée. Le workflow SEO Agent exécute donc lui-même ses tests et sa comparaison avant d'ouvrir une PR; ne pas rendre SEO QA obligatoire sans prévoir ce cas.

La gratuité concerne les scripts et les runners GitHub standards du dépôt public. Aucun service payant, grand runner ou serveur n'est demandé.
