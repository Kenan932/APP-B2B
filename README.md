# CyberProspect — Analyseur Prospects Cybersécurité B2B

Application web statique d'analyse commerciale cybersécurité. Entrez l'URL d'un prospect et obtenez instantanément une analyse publique non intrusive, un score de pertinence, et un email de prospection personnalisé.

## Fonctionnalités

- Analyse publique non intrusive (aucun scan, aucun test)
- Score de pertinence du prospect /10
- Détection de la maturité IT
- Observations de sécurité formulées prudemment
- Besoins cybersécurité probables + services recommandés
- Email de prospection personnalisé (~150 mots)
- Clé API stockée localement dans le navigateur

## Déploiement sur GitHub Pages (5 minutes)

### Étape 1 — Créer le dépôt GitHub

1. Connectez-vous sur [github.com](https://github.com)
2. Cliquez sur **New repository** (bouton vert en haut à droite)
3. Nommez-le `cyberprospect` (ou ce que vous voulez)
4. Cochez **Public**
5. Cliquez **Create repository**

### Étape 2 — Uploader les fichiers

**Option A — Via l'interface web GitHub (sans Git)**

1. Sur la page de votre nouveau dépôt, cliquez **uploading an existing file**
2. Glissez-déposez TOUS les fichiers en respectant la structure :
   ```
   index.html
   css/style.css
   js/app.js
   README.md
   ```
   > ⚠️ Pour les sous-dossiers `css/` et `js/` : créez d'abord le fichier `css/style.css` en cliquant "Add file > Create new file" et tapez `css/style.css` dans le champ nom (GitHub crée le dossier automatiquement).

3. Cliquez **Commit changes**

**Option B — Via Git en ligne de commande**

```bash
git clone https://github.com/VOTRE_USERNAME/cyberprospect.git
cd cyberprospect

# Copiez les fichiers ici, puis :
git add .
git commit -m "Initial commit"
git push origin main
```

### Étape 3 — Activer GitHub Pages

1. Dans votre dépôt, allez dans **Settings** (onglet en haut)
2. Dans le menu gauche, cliquez **Pages**
3. Sous "Source", sélectionnez **Deploy from a branch**
4. Choisissez la branche **main** et le dossier **/ (root)**
5. Cliquez **Save**

Attendez 1-2 minutes. Votre site sera disponible à :
```
https://VOTRE_USERNAME.github.io/cyberprospect/
```

### Étape 4 — Configurer votre clé API

1. Obtenez une clé API sur [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Sur le site déployé, collez votre clé dans le champ prévu et cliquez **Enregistrer**
3. La clé est stockée dans votre navigateur uniquement (localStorage) — elle n'est jamais envoyée ailleurs

## Structure des fichiers

```
cyberprospect/
├── index.html        # Page principale
├── css/
│   └── style.css     # Styles
├── js/
│   └── app.js        # Logique applicative
└── README.md         # Ce fichier
```

## Sécurité & conformité

- Analyse basée uniquement sur des informations publiquement accessibles
- Aucun scan réseau, aucun test de pénétration, aucune action intrusive
- Formulations prudentes : "point à vérifier", "risque potentiel", "opportunité d'audit"
- Clé API stockée localement dans le navigateur de l'utilisateur
- Aucune donnée transmise à un serveur tiers (appels directs vers api.anthropic.com)

## Coût estimé

Chaque analyse consomme environ 1 500 à 2 500 tokens (input + output).
Avec le modèle claude-sonnet-4 : ~0,01 $ par analyse.

## Personnalisation

Pour modifier le prompt d'analyse, éditez la variable `prompt` dans `js/app.js` (fonction `startAnalysis`).
