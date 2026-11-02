# Activer les comptes par rôle

L'application front-end ne peut pas créer elle-même des utilisateurs Supabase. Le mot de passe doit être traité par une fonction serveur; la clé `service_role` ne doit jamais être ajoutée au code du navigateur, au dépôt ou à Netlify.

## Déploiement Supabase

Le projet est configuré avec la référence `lrhpklsrwwuyubgxjfla`.

1. Dans le tableau de bord Supabase, ouvrez **SQL Editor**, collez le contenu complet de `supabase/schema.sql`, puis exécutez-le. Le script peut être rejoué : il utilise des `IF NOT EXISTS` et recrée les politiques avec `DROP POLICY IF EXISTS`.
2. Dans **Edge Functions > Secrets**, vérifiez que les secrets gérés par Supabase `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont disponibles. La clé `service_role` reste côté serveur uniquement.
3. Depuis la racine du dépôt, installez Supabase CLI si nécessaire, puis exécutez :

```sh
supabase login
supabase link --project-ref lrhpklsrwwuyubgxjfla
supabase functions deploy admin-manage-user
```

La fonction refuse les appels sans JWT et n'autorise que les origines `https://scolagest.netlify.app` et `http://localhost:8888`. Pour un domaine de production différent, définissez le secret serveur `APP_ALLOWED_ORIGINS` avec les origines exactes séparées par des virgules, puis redéployez la fonction. Ne mettez jamais `null` ni `*` dans cette liste.

4. Publiez ensuite les changements front-end sur Netlify. Les nouveaux rôles ne pourront se connecter qu'après le déploiement de la migration et de la fonction.

## Parcours administrateur

Dans **Utilisateurs > Nouveau compte**, choisissez un des six rôles, saisissez l'e-mail et un mot de passe temporaire fort, puis associez l'enseignant ou l'élève si le rôle le demande. Le service vérifie que l'appelant est administrateur et que les associations appartiennent à l'établissement. Les mots de passe ne sont pas conservés dans `school_data`.

L'Enseignant ne reçoit que ses classes, matières, élèves et créneaux. Le Parent reçoit uniquement ses enfants, l'Élève uniquement son propre dossier. Directeur reçoit les données correspondant à son rôle; Administration ne reçoit pas la liste des comptes. Tous les rôles autres qu'Administrateur sont en lecture seule tant que l'application écrit les données dans un JSON unique. Un administrateur peut générer un nouveau mot de passe temporaire depuis la modification du compte.

## Vérification après publication

- Un administrateur peut créer un compte Parent, Élève ou Enseignant lié à son dossier, ainsi que des comptes de rôle administratif.
- Un Parent reçoit uniquement ses enfants dans `get_my_school_data`; un Élève ne reçoit que son propre dossier; un Enseignant ne reçoit que son périmètre pédagogique.
- Une requête directe anonyme vers `school_data` reste refusée par RLS.
- Un e-mail déjà utilisé, un lien vers un dossier d'un autre établissement ou un rôle invalide est refusé.
- Supprimer un compte révoque son utilisateur Supabase et supprime son membership.
