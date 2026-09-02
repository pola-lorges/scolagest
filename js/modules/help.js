/**
 * Guide d'utilisation de l'application et informations sur son créateur.
 */
const Help = (() => {
  const sections = [
    {
      id: "start", icon: "🚀", title: "Premiers pas",
      content: `<p>Après connexion, la barre latérale donne accès aux modules autorisés pour votre rôle. Le titre en haut de l'écran indique la page active et le badge rappelle l'année scolaire et la période en cours.</p><ul><li>Commencez par vérifier les <strong>Paramètres</strong> : nom de l'établissement, année scolaire et période.</li><li>Utilisez le bouton ☰ pour afficher ou masquer le menu, notamment sur petit écran.</li><li>Le bouton 🌙 change le thème clair ou sombre. Le bouton 🚪 ferme votre session.</li><li>Les modifications sont enregistrées dans le navigateur utilisé, dans son stockage local.</li></ul>`,
    },
    {
      id: "dashboard", icon: "📊", title: "Tableau de bord",
      content: `<p>Le tableau de bord offre une vue immédiate de l'établissement : nombre d'élèves, classes, enseignants, absences du jour, encaissements et reste à recouvrer.</p><ul><li>Consultez la répartition des élèves par statut.</li><li>Vérifiez l'effectif de chaque classe par rapport à sa capacité.</li><li>Les chiffres affichés reflètent les données accessibles à votre compte.</li></ul>`,
    },
    {
      id: "school", icon: "🏫", title: "Élèves, classes et enseignants",
      content: `<p>Ces trois modules constituent le référentiel de l'établissement. Créez d'abord les classes, puis enregistrez les élèves et les enseignants qui leur sont associés.</p><ul><li><strong>Élèves :</strong> ajoutez l'identité, les coordonnées, la classe, le statut et les informations du responsable.</li><li><strong>Classes :</strong> définissez le niveau, la capacité et l'enseignant principal.</li><li><strong>Enseignants :</strong> renseignez les coordonnées et les matières enseignées.</li><li>Utilisez la recherche et les filtres des tableaux pour retrouver rapidement une fiche.</li><li>Les boutons d'action permettent de consulter, modifier ou supprimer une donnée lorsque votre rôle le permet.</li></ul>`,
    },
    {
      id: "academic", icon: "📚", title: "Matières, notes et bulletins",
      content: `<p>Le suivi pédagogique se fait dans trois modules complémentaires. Créez les matières avant de saisir les évaluations.</p><ul><li><strong>Matières :</strong> gérez le libellé, le code et le coefficient de chaque discipline.</li><li><strong>Notes :</strong> choisissez une classe, une matière et une période, puis saisissez les notes des élèves. Vérifiez le barème et le coefficient avant validation.</li><li><strong>Bulletins :</strong> sélectionnez l'élève et la période pour contrôler les résultats, les moyennes et les appréciations.</li><li>Le bouton d'export permet de générer un bulletin PDF avec les informations de l'établissement et son logo.</li></ul>`,
    },
    {
      id: "attendance", icon: "🕐", title: "Absences et emploi du temps",
      content: `<p>Enregistrez les événements le plus près possible de leur date réelle pour conserver un suivi fiable.</p><ul><li><strong>Absences & retards :</strong> sélectionnez la date, l'élève ou l'enseignant, le type d'événement et ajoutez un motif si nécessaire.</li><li>Corrigez une saisie depuis la liste avant de clôturer la période.</li><li><strong>Emploi du temps :</strong> choisissez la classe et le jour, puis renseignez l'horaire, la matière, l'enseignant et la salle.</li><li>Sur mobile, faites défiler horizontalement les grilles larges.</li></ul>`,
    },
    {
      id: "finance", icon: "💰", title: "Paiements et frais scolaires",
      content: `<p>Le module Paiements permet de suivre les frais dus, les versements et le solde restant pour chaque élève.</p><ul><li>Créez les frais ou échéances avec leur montant et leur date limite.</li><li>Enregistrez chaque versement séparément afin de conserver un historique précis.</li><li>Contrôlez le total payé et le reste à payer avant de remettre un reçu.</li><li>Les montants sont affichés dans la devise configurée par l'application.</li></ul>`,
    },
    {
      id: "portal", icon: "👪", title: "Portail parents et documents",
      content: `<p>Le portail parents centralise les responsables liés aux élèves. Le module Documents rassemble les pièces utiles au suivi scolaire.</p><ul><li>Associez chaque parent ou responsable au bon élève avec des coordonnées à jour.</li><li>Les comptes parent et élève ne voient que les modules et informations prévus pour leur rôle.</li><li>Ajoutez une description claire à chaque document et utilisez un nom de fichier explicite.</li><li>Vérifiez les droits avant de partager un document contenant des informations personnelles.</li></ul>`,
    },
    {
      id: "access", icon: "🔐", title: "Comptes et droits d'accès",
      content: `<p>Les droits dépendent du rôle : Administrateur, Directeur, Administration, Enseignant, Parent ou Élève. Un accès en lecture permet de consulter, tandis qu'un accès complet permet aussi de gérer les données.</p><ul><li>Attribuez à chaque personne le rôle le plus restrictif compatible avec sa mission.</li><li>Ne partagez jamais un mot de passe et supprimez les comptes qui ne sont plus utilisés.</li><li>L'Administrateur gère les comptes et la matrice des droits depuis <strong>Utilisateurs</strong>.</li><li>Si un module n'apparaît pas, votre rôle n'y est probablement pas autorisé.</li></ul>`,
    },
    {
      id: "data", icon: "⚙️", title: "Paramètres et données",
      content: `<p>Les paramètres définissent le contexte de travail de l'année. Les données sont stockées localement dans le navigateur : elles ne sont pas automatiquement synchronisées entre appareils.</p><ul><li>Faites régulièrement une copie des informations importantes selon la procédure de votre établissement.</li><li>Évitez de supprimer les données du navigateur avant d'avoir sécurisé vos informations.</li><li><strong>Réinitialiser toutes les données</strong> efface les données actuelles et restaure les données de démonstration : cette action est à utiliser avec prudence.</li><li>Après un changement d'année ou de période, contrôlez les bulletins, notes et paiements associés.</li></ul>`,
    },
  ];

  function render(container) {
    container.innerHTML = `<div class="panel help-hero"><h2>Bien utiliser Scolagest</h2><p>Retrouvez les étapes, conseils et règles de chaque module dans ce guide. Recherchez un mot-clé pour accéder directement à l'information utile.</p><div class="help-search"><span>🔎</span><input id="helpSearch" type="search" placeholder="Rechercher dans le guide..." aria-label="Rechercher dans le guide"></div></div><div class="help-layout"><div id="helpSections">${sections.map((section) => `<section class="panel help-section" data-help-text="${(section.title + " " + section.content.replace(/<[^>]+>/g, " ")).toLowerCase()}" id="help-${section.id}"><h3>${section.icon} ${section.title}</h3>${section.content}</section>`).join("")}<div class="panel empty-state help-empty" id="helpEmpty">Aucune rubrique ne correspond à votre recherche.</div></div><aside class="panel help-index"><h3>Dans ce guide</h3>${sections.map((section) => `<a href="#help-${section.id}">${section.icon} ${section.title}</a>`).join("")}</aside></div><div class="panel creator-card"><h3>À propos du créateur</h3><p class="creator-name">POLA LORGES ANTHONY</p><p class="creator-role">Ingénieur en génie logiciel<br>Créateur et concepteur de l'application Scolagest</p><p>✉️ <a href="mailto:anthonypola100@gmail.com">anthonypola100@gmail.com</a><br>💬 WhatsApp : <a href="https://wa.me/237693387661" target="_blank" rel="noopener">+237 693 387 661</a></p></div>`;
    const search = container.querySelector("#helpSearch");
    const empty = container.querySelector("#helpEmpty");
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      let visibleCount = 0;
      container.querySelectorAll(".help-section").forEach((section) => {
        const visible = !query || section.dataset.helpText.includes(query);
        section.style.display = visible ? "" : "none";
        if (visible) visibleCount += 1;
      });
      empty.style.display = visibleCount ? "none" : "block";
    });
  }

  return { render };
})();