import { PRODUCT_NAME } from '../../../../src/config/productEdition';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-8 py-4">
      <div>
        <p className="text-center text-xs leading-5" style={{ color: 'var(--mantine-color-dimmed)' }}>
          &copy; {currentYear} {PRODUCT_NAME}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
