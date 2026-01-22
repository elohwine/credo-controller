import React, { useState } from 'react';
import { BRAND } from '@/lib/theme';
import { PlayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

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
            <div className="text-center py-8 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                <p style={{ color: BRAND.dark }}>No schema definition found.</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {Object.entries(schema.properties).map(([key, field]: [string, any]) => {
                const isRequired = schema.required?.includes(key);

                return (
                    <div key={key}>
                        <label htmlFor={key} className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>
                            {field.title || key} {isRequired && <span className="text-red-500">*</span>}
                        </label>
                        <div className="mt-1">
                            {field.type === 'array' ? (
                                // Simple JSON input for arrays for now
                                <textarea
                                    id={key}
                                    rows={3}
                                    className="shadow-sm block w-full sm:text-sm rounded-lg border-gray-300 focus:ring-2"
                                    style={{ borderColor: BRAND.viking }}
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
                                    className="shadow-sm block w-full sm:text-sm rounded-lg border-gray-300 focus:ring-2"
                                    style={{ borderColor: BRAND.viking }}
                                    onChange={(e) => handleChange(key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                                />
                            )}
                        </div>
                        {field.description && (
                            <p className="mt-1.5 text-sm text-gray-500">{field.description}</p>
                        )}
                    </div>
                );
            })}

            <div className="pt-5">
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
                        style={{ backgroundColor: BRAND.curious }}
                    >
                        {isLoading ? (
                            <>
                                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <PlayIcon className="h-5 w-5" />
                                Execute Workflow
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default DynamicForm;
