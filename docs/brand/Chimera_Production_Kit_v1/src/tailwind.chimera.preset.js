/** CHIMERA Tailwind preset */
module.exports = {
  theme: {
    extend: {
      colors: {
        chimera: {
          void: '#090B0F', carbon: '#151A20', gunmetal: '#28313A', titanium: '#B9C2CA',
          white: '#F3F6F8', ignition: '#FF6A21', afterburn: '#FFB02E', pythia: '#7F5CFF', signal: '#26D0FF'
        }
      },
      boxShadow: { 'chimera-panel':'0 12px 32px rgba(0,0,0,.32)', 'chimera-glow':'0 0 24px rgba(255,106,33,.22)' },
      borderRadius: { 'chimera':'10px' }
    }
  }
};
