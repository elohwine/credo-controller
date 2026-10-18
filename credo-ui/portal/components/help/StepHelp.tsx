import React, { useState } from 'react'
import { Button, Drawer, Group, List, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

/**
 * Visible help. Android has no hover, and a small info icon is easy to miss.
 * Material's pattern is a labelled chip that opens a bottom sheet. The chip is
 * 32dp so it sits on a title row; the tap target stays 48dp and overlaps the
 * row by 8dp each side, so it does not push the title down.
 */
export function StepHelp({ title, points }: { title: string; points: string[] }) {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <UnstyledButton
        onClick={() => setOpened(true)}
        aria-label={`Help: ${title}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          minHeight: 48,
          minWidth: 48,
          marginTop: -8,
          marginBottom: -8,
          paddingInline: 4,
        }}
      >
        <Group
          gap={4}
          wrap="nowrap"
          align="center"
          style={{
            height: 32,
            paddingInline: 10,
            borderRadius: 16,
            background: 'var(--mantine-color-blue-light)',
            color: 'var(--mantine-color-blue-light-color)',
          }}
        >
          <IconInfoCircle size={16} />
          <Text size="sm" fw={500} lh={1}>Help</Text>
        </Group>
      </UnstyledButton>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="bottom"
        size="auto"
        title={title}
        radius="lg"
        styles={{
          // Mantine maps size="auto" to an undefined --drawer-size-auto token and
          // falls back to full height; define it so the sheet is as tall as its content.
          root: { '--drawer-size-auto': 'auto' } as React.CSSProperties,
          content: { borderRadius: '16px 16px 0 0' },
        }}
      >
        <Stack gap="md" pb="lg">
          <Text size="sm" c="dimmed">What this is for</Text>
          <List spacing="sm" size="sm" listStyleType="disc" withPadding>
            {points.map((point) => (
              <List.Item key={point}>{point}</List.Item>
            ))}
          </List>
          <Button fullWidth size="md" onClick={() => setOpened(false)}>
            Close
          </Button>
        </Stack>
      </Drawer>
    </>
  )
}
