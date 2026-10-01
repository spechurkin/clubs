import {tr} from '../shared/i18n';
import type {Character, Club, RelationType} from '../shared/model';
import {sortByName} from './sorting';
import {CENTER, clubPositions, clubRadius, diagramBounds, edgeGeometry, initials, truncate,} from './geometry';

type Props = {
    club: Club;
  characters: Character[];
  types: RelationType[];
  selectedCharacter?: string;
  selectedEdge?: string;
  hiddenTypes?: Set<string>;
  showLabels?: boolean;
  clean?: boolean;
  onCharacter?: (id: string) => void;
  onEdge?: (id: string) => void;
  onBackground?: () => void;
};

export default function Diagram({
                                    club,
  characters,
  types,
  selectedCharacter,
  selectedEdge,
  hiddenTypes = new Set(),
  showLabels = false,
  clean,
  onCharacter,
  onEdge,
  onBackground,
}: Props) {
    const positions = clubPositions(club.characterIds);
    const radius = clubRadius(club.characterIds.length);
    const legend = sortByName(types.filter((t) => club.connections.some((e) => e.typeId === t.id)));
    const bounds = diagramBounds(club.characterIds.length, clean ? legend.length : 0);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      width={clean ? bounds.width : undefined}
      height={clean ? bounds.height : undefined}
      className="diagram"
      role={clean ? 'img' : 'group'}
      aria-label={tr('diagram.titleLabel', club.name)}
      data-testid="diagram"
    >
      <defs>
        <pattern id="paper-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="#c9cfca" opacity="0.5" />
        </pattern>
        {types.map((type) => (
          <marker
            key={type.id}
            id={`arrow-${type.id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 1 L 8 5 L 0 9"
              fill="none"
              stroke={type.color}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        ))}
        {characters
          .filter((c) => c.image)
          .map((c) => (
            <clipPath key={c.id} id={`portrait-${c.id}`}>
              <circle r="32" />
            </clipPath>
          ))}
      </defs>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="#f7f8f4"
        onClick={onBackground}
      />
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="url(#paper-dots)"
        pointerEvents="none"
      />
      {clean && (
        <>
          <text
            x={bounds.x + 38}
            y={bounds.y + 46}
            fontFamily="sans-serif"
            fontSize="19"
            fontWeight="700"
            fill="#273733"
          >
              {club.name}
          </text>
          <text
            x={bounds.x + 38}
            y={bounds.y + 69}
            fontFamily="sans-serif"
            fontSize="12"
            fill="#71807b"
          >
              {truncate(club.description, 95)}
          </text>
        </>
      )}
      <circle
        cx={CENTER.x}
        cy={CENTER.y}
        r={radius}
        fill="none"
        stroke="#d0d8d1"
        strokeWidth="1.1"
        strokeDasharray="3 7"
        pointerEvents="none"
      />
      <circle
        cx={CENTER.x}
        cy={CENTER.y}
        r={radius - 13}
        fill="none"
        stroke="#e9ede6"
        strokeWidth="1"
        pointerEvents="none"
      />
        {club.connections.map((edge) => {
        if (hiddenTypes.has(edge.typeId)) return null;
        const type = types.find((t) => t.id === edge.typeId);
        if (!type || !positions.has(edge.sourceId) || !positions.has(edge.targetId)) return null;
            const {path, label} = edgeGeometry(edge, club.connections, positions);
        const selected = selectedEdge === edge.id;
        const faded =
          !!selectedCharacter &&
          edge.sourceId !== selectedCharacter &&
          edge.targetId !== selectedCharacter;
        return (
          <g key={edge.id} opacity={faded ? 0.13 : 1} className="diagram-edge">
            <title>
              {characters.find((c) => c.id === edge.sourceId)?.name} {edge.directed ? '→' : '—'}{' '}
              {characters.find((c) => c.id === edge.targetId)?.name}: {type.name}
              {edge.notes ? ` (${edge.notes})` : ''}
            </title>
            {selected && (
              <path d={path} fill="none" stroke={type.color} strokeWidth="9" opacity="0.15" />
            )}
            <path
              d={path}
              fill="none"
              stroke={type.color}
              strokeWidth={selected ? 2.8 : 1.8}
              opacity={selected ? 1 : 0.75}
              markerEnd={edge.directed ? `url(#arrow-${type.id})` : undefined}
            />
            {!clean && (
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="16"
                role="button"
                tabIndex={0}
                aria-label={tr(
                  'diagram.connectionLabel',
                  characters.find((c) => c.id === edge.sourceId)?.name,
                  characters.find((c) => c.id === edge.targetId)?.name,
                  type.name,
                )}
                onClick={() => onEdge?.(edge.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onEdge?.(edge.id);
                  }
                }}
              />
            )}
            {showLabels && (
              <g pointerEvents="none">
                <rect
                  x={label.x - Math.min(86, type.name.length * 3.5 + 12)}
                  y={label.y - 12}
                  width={Math.min(172, type.name.length * 7 + 24)}
                  height="24"
                  rx="12"
                  fill="#f7f8f4"
                  stroke={type.color}
                  strokeOpacity="0.25"
                />
                <text
                  x={label.x}
                  y={label.y + 4}
                  textAnchor="middle"
                  fill={type.color}
                  fontFamily="sans-serif"
                  fontSize="11"
                >
                  {truncate(type.name, 20)}
                </text>
              </g>
            )}
          </g>
        );
      })}
        {club.characterIds.map((id) => {
        const character = characters.find((c) => c.id === id);
        const position = positions.get(id);
        if (!character || !position) return null;
        const selected = selectedCharacter === id;
        const angle = Math.atan2(position.y - CENTER.y, position.x - CENTER.x);
        const labelY = Math.sin(angle) < -0.65 ? -55 : 58;
        return (
          <g
            key={id}
            transform={`translate(${position.x}, ${position.y})`}
            className="diagram-node"
            role={clean ? undefined : 'button'}
            tabIndex={clean ? undefined : 0}
            aria-label={tr('diagram.characterLabel', character.name)}
            onClick={() => onCharacter?.(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCharacter?.(id);
              }
            }}
          >
            <title>
              {character.name}
              {character.notes ? ` — ${character.notes}` : ''}
            </title>
            <circle
              r={selected ? 42 : 38}
              fill="#f7f8f4"
              stroke={selected ? '#327964' : '#e0e5dd'}
              strokeWidth={selected ? 1.8 : 1}
            />
            {character.image ? (
              <image
                href={character.image}
                x="-32"
                y="-32"
                width="64"
                height="64"
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#portrait-${id})`}
              />
            ) : (
              <>
                <circle r="32" fill={character.color} />
                <text
                  y="7"
                  textAnchor="middle"
                  fill="#182f2c"
                  fontFamily="sans-serif"
                  fontWeight="600"
                  fontSize="20"
                >
                  {initials(character.name)}
                </text>
              </>
            )}
            <text
              y={labelY}
              textAnchor="middle"
              fill="#34483f"
              fontFamily="sans-serif"
              fontWeight="600"
              fontSize="12.5"
            >
                {truncate(character.name, club.characterIds.length > 12 ? 14 : 24)}
            </text>
          </g>
        );
      })}
      {clean && (
        <g
          transform={`translate(${bounds.x + 38},${bounds.y + bounds.height - bounds.legendHeight - 44})`}
        >
          {legend.map((type, index) => (
            <g
              key={type.id}
              transform={`translate(${(index % 4) * 215}, ${Math.floor(index / 4) * 20})`}
            >
              <circle r="3.5" fill={type.color} />
              <text x="11" y="4" fontFamily="sans-serif" fontSize="11" fill="#71807b">
                {truncate(type.name, 24)}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
