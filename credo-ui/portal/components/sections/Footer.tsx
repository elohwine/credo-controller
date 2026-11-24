import { Box, Text } from '@mantine/core';
import { PRODUCT_NAME } from '../../../../src/config/productEdition';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <Box component="footer" mt="xl" py="md">
      <Text ta="center" size="xs" c="dimmed" lh={1.67}>
        &copy; {currentYear} {PRODUCT_NAME}. All rights reserved.
      </Text>
    </Box>
  );
}
