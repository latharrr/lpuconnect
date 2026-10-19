function initialsOf(name) {
    const safe = name || '??';
    return safe.split(/[-\s]+/).map(w => w?.[0] || '').join('').slice(0, 2).toUpperCase() || '?';
}

// A booth print: initials on silver emulsion. `latent` keeps it fogged until identities are revealed.
export default function Print({ name, size = 48, latent = false }) {
    return (
        <div className="print" data-latent={latent} style={{ width: size, height: size }} aria-hidden="true">
            <div className="print-emulsion" style={{ fontSize: Math.round(size * 0.42) }}>
                <span>{latent ? '?' : initialsOf(name)}</span>
            </div>
        </div>
    );
}
