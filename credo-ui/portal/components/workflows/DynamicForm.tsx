import React, { useState } from 'react';
import { Button, Group, Paper, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';

interface DynamicFormProps {
    schema: any;
    onSubmit: (data: any) => void;
    isLoading?: boolean;
}

const DynamicForm: React.FC<DynamicFormProps> = ({ schema, onSubmit, isLoading }) => {
    const [formData, setFormData] = useState<Record<string, any>>({});

    const handleChange = (key: string, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    if (!schema || !schema.properties) {
        return (
            <Paper withBorder radius="md" py="xl" ta="center">
                <Text>No form fields are set up for this workflow.</Text>
            </Paper>
        );
    }

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="lg">
                {Object.entries(schema.properties).map(([key, field]: [string, any]) => {
                    const isRequired = schema.required?.includes(key);

                    return field.type === 'array' ? (
                        // Simple JSON input for arrays for now
                        <Textarea
                            key={key}
                            id={key}
                            rows={3}
                            label={field.title || key}
                            withAsterisk={isRequired}
                            description={field.description}
                            inputWrapperOrder={['label', 'input', 'description', 'error']}
                            placeholder="Enter JSON array..."
                            onChange={(e) => {
                                try {
                                    handleChange(key, JSON.parse(e.target.value));
                                } catch (err) {
                                    // Ignore parse errors while typing
                                }
                            }}
                        />
                    ) : (
                        <TextInput
                            key={key}
                            type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                            id={key}
                            required={isRequired}
                            label={field.title || key}
                            description={field.description}
                            inputWrapperOrder={['label', 'input', 'description', 'error']}
                            onChange={(e) => handleChange(key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                        />
                    );
                })}

                <Group justify="flex-end" pt="md">
                    <Button type="submit" loading={isLoading} leftSection={<IconPlayerPlay size={16} />}>
                        {isLoading ? 'Processing...' : 'Run Workflow'}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

export default DynamicForm;
