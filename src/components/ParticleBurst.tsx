import { useState, useEffect, useCallback, useRef } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  delay: number;
  angle: number;
  size: number;
}

interface ParticleBurstProps {
  active: boolean;
  onComplete?: () => void;
  colors?: string[];
  count?: number;
}

const defaultColors = [
  'rgb(74, 222, 128)',  // green
  'rgb(91, 158, 201)',  // blue
  'rgb(224, 160, 48)',  // amber
  'rgb(74, 222, 128)',  // green again
  'rgb(232, 226, 217)', // warm white
  'rgb(91, 158, 201)',  // blue again
  'rgb(74, 222, 128)',  // green
  'rgb(224, 160, 48)',  // amber
];

export default function ParticleBurst({ active, onComplete, colors = defaultColors, count = 8 }: ParticleBurstProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const generate = useCallback(() => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (360 / count) * i + (Math.random() * 30 - 15);
      newParticles.push({
        id: i,
        x: Math.cos((angle * Math.PI) / 180) * (20 + Math.random() * 15),
        y: -Math.abs(Math.sin((angle * Math.PI) / 180) * (25 + Math.random() * 20)) - 10,
        color: colors[i % colors.length],
        delay: Math.random() * 100,
        angle,
        size: 5 + Math.random() * 3,
      });
    }
    setParticles(newParticles);
  }, [count, colors]);

  useEffect(() => {
    if (active) {
      generate();
      const timer = setTimeout(() => {
        setParticles([]);
        onCompleteRef.current?.();
      }, 1200);
      return () => clearTimeout(timer);
    } else {
      setParticles([]);
    }
  }, [active, generate]);

  if (particles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
      <div className="relative w-full h-full">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              boxShadow: `0 0 6px ${p.color}`,
              animation: `particleRise 1s ease-out ${p.delay}ms forwards`,
              transform: `translate(${p.x}px, ${p.y}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
