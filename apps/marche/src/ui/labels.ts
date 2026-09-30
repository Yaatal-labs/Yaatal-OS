import type { Permission } from "../manifest/types";

/** Plain-French ("vous" form) explanations shown on an app's detail page for each
 *  permission it declares. Everyday tech words (app, partager) stay as-is — no dictionary
 *  French. */
export const PERMISSION_LABELS_FR: Record<Permission, { title: string; detail: string }> = {
  identity: {
    title: "Vous reconnaître",
    detail:
      "Cette app peut vous reconnaître d'une visite à l'autre, avec un identifiant propre à elle. Elle ne voit jamais votre numéro de téléphone.",
  },
  share: {
    title: "Partager",
    detail: "Cette app peut vous proposer de partager un lien ou un texte, par exemple vers WhatsApp.",
  },
  pay: {
    title: "Paiement (bientôt)",
    detail:
      "Cette app prévoit de vous proposer un paiement en FCFA plus tard. Ce n'est pas encore disponible.",
  },
};
