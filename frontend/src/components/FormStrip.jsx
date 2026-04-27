import React from 'react';

export default function FormStrip({ form }) {
  if (!form) return null;
  const matches = form.split('').slice(0, 5);
  return (
    <div className="flex gap-1">
      {matches.map((res, i) => (
        <div 
          key={i} 
          className={`w-4 h-4 rounded text-[7px] font-black flex items-center justify-center text-white ${
            res === 'W' ? 'bg-secondary' : res === 'L' ? 'bg-error' : 'bg-outline'
          }`}
          title={`Result: ${res}`}
        >
          {res}
        </div>
      ))}
    </div>
  );
}
