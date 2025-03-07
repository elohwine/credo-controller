import { IocContainer } from '@tsoa/runtime';
import { container } from 'tsyringe';

export const iocContainer: IocContainer = {
  // Accept a class constructor directly, not an object with prototype
  get: <T>(controller: { new (): T }): T => {
    return container.resolve<T>(controller); // Resolve directly using the class constructor
  },
};

