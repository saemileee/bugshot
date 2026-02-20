import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Convert rem → px (base 16px) so the widget renders correctly
// on pages where root font-size != 16px (e.g. 10px = 1rem)
const remToPx = () => ({
  postcssPlugin: 'rem-to-px',
  Declaration(decl) {
    if (decl.value.includes('rem')) {
      decl.value = decl.value.replace(
        /(-?[0-9]*\.?[0-9]+)rem/g,
        (_, val) => `${parseFloat(val) * 16}px`,
      );
    }
  },
});
remToPx.postcss = true;

export default {
  plugins: [tailwindcss, remToPx, autoprefixer],
};
