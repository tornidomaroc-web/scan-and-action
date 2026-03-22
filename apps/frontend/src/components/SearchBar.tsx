import React from 'react';

export const SearchBar = ({ value, onChange, onSubmit, placeholder, rtl }: any) => (
  <form className="search-bar-form" onSubmit={onSubmit} dir={rtl ? 'rtl' : 'ltr'}>
    <input 
      type="text" 
      className="search-input" 
      value={value} 
      onChange={onChange} 
      placeholder={placeholder} 
    />
    <button type="submit" className="search-submit">🔍</button>
  </form>
);
