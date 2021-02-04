
var about_fr = [
    "#Note sur l'application",
    "Ce client JavaScript communique avec un serveur sur lequel réside l'implémentation complète des règles du jeu, ainsi que les algorithmes d'IA. L'idée du projet est de s'intéresser à des algorithmes que l'on nomme \"General Game Playing\" (GGP). Il s'agit d'une catégorie d'algorithmes visant à pouvoir jouer à plusieurs jeux sans avoir recours à des connaissances préalables sur le jeu lui-même. Cela permet de considérer un jeu comme une boite noire et de raisonner de manière abstraite sur celui-ci. De nouveaux jeux peuvent alors être ajoutés sans avoir à modifier l'IA elle-même.",
    "L'application a été développée en C++ afin de pouvoir exploiter au maximum les performances de la machine sur laquelle elle tourne. Elle prend la forme, d'une part, d'une librairie spécifique se focalisant sur tout l'aspect algorithmique des jeux et des IA. Un serveur encapsule ensuite cette libraire afin de pouvoir s'interfacer avec elle au moyen d'un canal de communication basé sur les websockets. Le tout s'exécute dans une image Docker sur une VM hébergée sur le <a href=\"https://www.oracle.com/cloud/free/\">service Cloud d'Oracle</a>.",
    "#Note sur les IA",
    "Les agents développés dans ce projet n'utilisent que des concepts généraux indépendants des jeux auxquels ils jouent. Le but est alors de tout de même les amener à un niveau décent malgré les différents mécanismes qui peuvent apparaître dans les jeux, comme le hasard, les informations cachées, le bluff, les coups simultanés, etc.",
    "##Agent aléatoire",
    "Cet agent est le plus simple que l'on puisse imaginer, dans la mesure où il prend l'intégralité de ses décisions au hasard. Il offre néanmoins le mérite de jouer rapidement.",
    "##Agent MCTS",
    "Cet agent explore autant qu'il peut le graphe de tous les coups possibles afin, soit de percevoir le coup optimal le menant à la victoire, soit de collecter des statistiques sur les options lui offrant le plus de chances de succès. Il est redoutable sur les jeux dont la profondeur est limitée (par exemple le jeu Quantik), tout comme sur les jeux conduisant à une mort immédiate en cas d'erreur (comme le Puissance 4). Ses performances baissent sur les autres jeux car il ne dispose d'aucune intuition au-delà de l'horizon qu'il peut analyser. Pour résumer, c'est un peu comme jouer contre un adversaire très intelligent mais qui découvre le jeu pour la première fois.",
    "<b>L'auteur</b>: Jean-Sébastien Gonsette<br><ul><li><a href=\"https://www.linkedin.com/in/jsgonsette/\">LinkedIn</a></li><li><a href=\"https://jsgonsette.github.io\">Blog</a></li><li><a href=\"https://github.com/jsgonsette\">GitHub</a></li>"
]

var about_en = [
    "#About this application",
    "This JavaScript client communicates with a server on which resides the full implementation of the rules of the game, as well as the AI algorithms. The idea of the project is to focus on algorithms called \"General Game Playing \" (GGP). This is a category of algorithms aimed at being able to play multiple games without resorting to prior knowledge of the game itself. This makes it possible to consider a game as a black box and to reason in an abstract way about it. New games can then be added without having to modify the AI itself.",
    "The application was developed in C++ in order to make the most of the performance of the machine on which it is running. It takes the form, on the one hand, of a specific library focusing on the entire algorithmic aspect of games and AI. A server then encapsulates this library to make it accessible through a communication channel based on websockets. Everything is executed in a Docker image on a VM hosted on the <a href=\"https://www.oracle.com/cloud/free/\">Oracle Cloud service</a>.",
    "#About the AI",
    "The agents developed in this project only use general concepts independent of the games they play. The goal is then to bring them to a decent level despite the different mechanisms that can appear in games, such as chance, hidden information, bluffing, simultaneous blows, etc. ",
    "##Random Agent",
    "This agent is the simplest one can imagine, as he takes all of his decisions at random. It nevertheless offers the merit of playing quickly.",
    "##MCTS Agent",
    "This agent explores as much as he can the graph of all the possible moves in order to, either perceive the optimal move leading him to victory, or to collect statistics on the options offering him the most chances of success. It is formidable on games with limited depth (eg the Quantik game), as well as games leading to immediate death on error (such as the 4th Power). His performance drops in other games because he has no intuition beyond the horizon that he can analyze. To sum up, it's a bit like playing against a very intelligent opponent who is new to the game. ",
    "<b>The Author</b>: Jean-Sébastien Gonsette<br><ul><li><a href=\"https://www.linkedin.com/in/jsgonsette/\">LinkedIn</a></li><li><a href=\"https://jsgonsette.github.io\">Blog</a></li><li><a href=\"https://github.com/jsgonsette\">GitHub</a></li>"
]

var connect4_en = {
    title: "Connect 4",
    about: "Connect 4 is a two player strategy game. Each player successively drops a piece of his color in a column. The first player to line up 4 pieces of his color wins.",
    icons: ["./connect4/red.svg", "./connect4/yellow.svg"]
}

var connect4_fr = {
    title: "Puissance 4",
    about: "Puissance 4 est un jeu de stratégie à deux joueurs. Chaque joueur dépose successivement une pièce de sa couleur dans une colonne. Le premier joueur qui aligne 4 pièces de sa couleur a gagné.",
    icons: ["./connect4/red.svg", "./connect4/yellow.svg"]
}

var quantik_en = {
    title: "Quantik",
    about: "Quantik is a pure abstract strategy game. The goal is to be the first player to pose the fourth different forms of a line, a column or a square zone. Each turn the players will put one of their pieces on the boardgame. It's forbidden to put a shape in a line, a column or an area on which this same form has already been posed by the opponent. We can only double a shape if we have played the previous one ourself. The first player who places the fourth different form in a row, column or zone wins the game immediately, no matter who owns the other pieces of that winning move.",
    icons: ["./quantik/white.png", "./quantik/brown.png"]
}

var quantik_fr = {
    title: "Quantik",
    about: "Quantik est un jeu de stratégie abstrait où il faut être le premier joueur à poser la quatrième forme différente d’une ligne, d’une colonne ou d’une zone carrée. Chacun leur tour les joueurs vont poser une de leurs pièces sur le plateau. Il est interdit de poser une forme dans une ligne, une colonne ou une zone sur laquelle cette même forme a déjà été posée par l’adversaire. On ne peut doubler une forme que si l’on a joué la précédente soi-même. Le premier joueur qui pose la quatrième forme différente dans une ligne, une colonne ou une zone remporte immédiatement la partie, qu’importe à qui appartiennent les autres pièces de ce coup gagnant.",
    icons: ["./quantik/white.png", "./quantik/brown.png"]
}

var braverats_en = {
    title: "BraveRats",
    about: "BraveRats is a simple and short simultaneous action selection game for two that's played with cards. Both players have a hand of eight cards, numbered 0 to 7, with each card having a special power. Both players choose a card, then reveal them simultaneously. The highest card wins the round, and players play until someone has won four rounds. The cards' special powers greatly influence the game.",
    icons: ["./braverats/assets/red.png", "./braverats/assets/blue.png"]
}

var braverats_fr = {
    title: "BraveRats",
    about: "BraveRats est un jeu minimaliste pour deux joueurs. Chaque joueur a 8 cartes en main (numérotées de 0 à 7 et avec un pouvoir spécial). Chacun en choisit une, la pose et c'est la plus haute qui l'emporte. Le premier joueur a avoir gagné 4 rounds est le vainqueur. Et les pouvoirs spéciaux vont grandement influencer la partie !",
    icons: ["./braverats/assets/red.png", "./braverats/assets/blue.png"]
}

var games_en = {connect4: connect4_en, quantik: quantik_en, braverats: braverats_en}
var games_fr = {connect4: connect4_fr, quantik: quantik_fr, braverats: braverats_fr}

var languages = {
    "en": {
        preview: "About this game",
        about: about_en,
        other_games: "Other games",
        play: "Play",
        player: "Player",
        agent_mcts: "MCTS Agent",
        agent_random: "Random Agent",
        games: games_en
    },

    "fr": {
        preview: "Aperçu du jeu",
        about: about_fr,
        other_games: "Autres jeux",
        play: "Jouer",
        player: "Joueur",
        agent_mcts: "Agent MCTS",
        agent_random: "Agent aléatoire",
        games: games_fr
    }
}