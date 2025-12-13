import React, { useState } from 'react';
import Button from '../walt/button/Button';

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
        return <div>No schema definition found.</div>;
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {Object.entries(schema.properties).map(([key, field]: [string, any]) => {
                const isRequired = schema.required?.includes(key);

                return (
                    <div key={key}>
                        <label htmlFor={key} className="block text-sm font-medium text-gray-700">
                            {field.title || key} {isRequired && <span className="text-red-500">*</span>}
                        </label>
                        <div className="mt-1">
                            {field.type === 'array' ? (
                                // Simple JSON input for arrays for now
                                <textarea
                                    id={key}
                                    rows={3}
                                    className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
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
                                <input
                                    type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                                    id={key}
                                    required={isRequired}
                                    className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                                    onChange={(e) => handleChange(key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                                />
                            )}
                        </div>
                        {field.description && (
                            <p className="mt-2 text-sm text-gray-500">{field.description}</p>
                        )}
                    </div>
                );
            })}

            <div className="pt-5">
                <div className="flex justify-end">
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Processing...' : 'Execute Workflow'}
                    </Button>
                </div>
            </div>
        </form>
    );
};

export default DynamicForm;
