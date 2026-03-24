import React from 'react';

export const AppLogo: React.FC<{ size?: number; showText?: boolean }> = ({ size = 40, showText = true }) => {
  return (
    <div className="flex items-center gap-4 group">
      <div className="relative">
        <div className="absolute -inset-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl blur-lg opacity-40 group-hover:opacity-70 transition duration-1000"></div>
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 100 100" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="relative drop-shadow-2xl"
        >
          {/* Logo Mark: Stylized Scanner + Action Arrow */}
          <rect x="15" y="15" width="70" height="70" rx="18" fill="#0f172a" stroke="#ffffff" strokeWidth="4" />
          <path d="M30 40H70" stroke="#3b82f6" strokeWidth="8" strokeLinecap="round" className="animate-pulse" />
          <path d="M30 60H55" stroke="#3b82f6" strokeWidth="8" strokeLinecap="round" />
          <path d="M65 50L80 65M80 65L65 80M80 65H45" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className="text-3xl font-black text-white tracking-tighter leading-none italic uppercase">
            Scan<span className="text-blue-500">&</span>Action
          </span>
          <span className="text-xs font-black text-slate-500 uppercase tracking-[0.4em] mt-2">
            Intelligence OS
          </span>
        </div>
      )}
    </div>
  );
};

export const AppFavicon = () => {
  const svg = `
    <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="20" fill="#0f172a"/>
      <path d="M25 40H75" stroke="#3b82f6" stroke-width="10" stroke-linecap="round"/>
      <path d="M65 45L85 65L65 85" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  const base64 = btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
};
