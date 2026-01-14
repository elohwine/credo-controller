export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-24">
      <div className="my-8 md:order-1 md:mt-0">
        <p className="text-center text-xs leading-5" style={{ color: '#7B8794' }}>
          &copy; {currentYear} IdenEx. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
