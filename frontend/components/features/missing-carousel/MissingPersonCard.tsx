"use client";

import { memo } from "react";
import type { MissingPerson } from "@/hooks/missing";
import { mediaUrl } from "@/lib/api";

interface MissingPersonCardProps {
  person: MissingPerson;
  onOpen: () => void;
}

/**
 * Tarjeta de persona (presentacional, memoizada). UI verbatim del carousel
 * original. React.memo: con structuralSharing de TanStack la identidad de cada
 * `person` se conserva entre polls => no re-render de tarjetas sin cambios.
 */
function MissingPersonCardImpl({ person, onOpen }: MissingPersonCardProps) {
  const isFound = person.status === "found";
  const personMeta = [
    person.age !== null ? `${person.age} años` : null,
    person.nationality || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`e-person-card${isFound ? " e-person-card--found" : ""}`}
      role="listitem"
    >
      <div className="e-person-card__media">
        <span
          className={`e-person-card__badge${isFound ? " e-person-card__badge--found" : ""}`}
        >
          {isFound ? "ENCONTRADA" : "DESAPARECIDA"}
        </span>
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(person.photoUrl)}
            alt={`Foto de ${person.name}`}
            loading="lazy"
            className="e-person-card__photo"
          />
        ) : (
          <div
            className="e-person-card__photo e-person-card__photo--empty"
            aria-hidden
          >
            👤
          </div>
        )}
      </div>

      <div className="e-person-card__content">
        <div className="e-person-card__title-row">
          <span className="e-person-card__name" title={person.name}>
            {person.name}
          </span>
          {personMeta && (
            <span className="e-person-card__age">· {personMeta}</span>
          )}
        </div>

        {person.lastSeen && (
          <p className="e-person-card__row e-person-card__row--location">
            <span aria-hidden>📍</span>
            <span>{person.lastSeen}</span>
          </p>
        )}

        {person.contact && (
          <p className="e-person-card__row e-person-card__row--phone">
            <span aria-hidden>📞</span>
            <span>{person.contact}</span>
          </p>
        )}

        {person.description && (
          <p className="e-person-card__note">{person.description}</p>
        )}

        <p className="e-person-card__footer">Toca para ver más</p>
      </div>
    </button>
  );
}

export const MissingPersonCard = memo(MissingPersonCardImpl);
