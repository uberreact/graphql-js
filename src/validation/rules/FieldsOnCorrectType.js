/* @flow */
/**
 *  Copyright (c) 2015, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

import type { ValidationContext } from '../index';
import { GraphQLError } from '../../error';
import suggestionList from '../../jsutils/suggestionList';
import quotedOrList from '../../jsutils/quotedOrList';
import type { Field } from '../../language/ast';
import type { GraphQLSchema } from '../../type/schema';
import type { GraphQLOutputType } from '../../type/definition';
import {
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
} from '../../type/definition';


export function undefinedFieldMessage(
  fieldName: string,
  type: string,
  suggestedTypeNames: Array<string>,
  suggestedFieldNames: Array<string>
): string {
  let message = `Cannot query field "${fieldName}" on type "${type}".`;
  if (suggestedTypeNames.length !== 0) {
    const suggestions = quotedOrList(suggestedTypeNames);
    message += ` Did you mean to use an inline fragment on ${suggestions}?`;
  } else if (suggestedFieldNames.length !== 0) {
    message += ` Did you mean ${quotedOrList(suggestedFieldNames)}?`;
  }
  return message;
}

/**
 * Fields on correct type
 *
 * A GraphQL document is only valid if all fields selected are defined by the
 * parent type, or are an allowed meta field such as __typenamme
 */
export function FieldsOnCorrectType(context: ValidationContext): any {
  return {
    Field(node: Field) {
      const type = context.getParentType();
      if (type) {
        const fieldDef = context.getFieldDef();
        if (!fieldDef) {
          // This field doesn't exist, lets look for suggestions.
          const schema = context.getSchema();
          const fieldName = node.name.value;
          // First determine if there are any suggested types to condition on.
          const suggestedTypeNames =
            getSuggestedTypeNames(schema, type, fieldName);
          // If there are no suggested types, then perhaps this was a typo?
          const suggestedFieldNames = suggestedTypeNames.length !== 0 ?
            [] :
            getSuggestedFieldNames(schema, type, fieldName);

          // Report an error, including helpful suggestions.
          context.reportError(new GraphQLError(
            undefinedFieldMessage(
              fieldName,
              type.name,
              suggestedTypeNames,
              suggestedFieldNames
            ),
            [ node ]
          ));
        }
      }
    }
  };
}

/**
 * Go through all of the implementations of type, as well as the interfaces
 * that they implement. If any of those types include the provided field,
 * suggest them, sorted by how often the type is referenced,  starting
 * with Interfaces.
 */
function getSuggestedTypeNames(
  schema: GraphQLSchema,
  type: GraphQLOutputType,
  fieldName: string
): Array<string> {
  if (type instanceof GraphQLInterfaceType ||
      type instanceof GraphQLUnionType) {
    const suggestedObjectTypes = [];
    const interfaceUsageCount = Object.create(null);
    schema.getPossibleTypes(type).forEach(possibleType => {
      if (!possibleType.getFields()[fieldName]) {
        return;
      }
      // This object type defines this field.
      suggestedObjectTypes.push(possibleType.name);
      possibleType.getInterfaces().forEach(possibleInterface => {
        if (!possibleInterface.getFields()[fieldName]) {
          return;
        }
        // This interface type defines this field.
        interfaceUsageCount[possibleInterface.name] =
          (interfaceUsageCount[possibleInterface.name] || 0) + 1;
      });
    });

    // Suggest interface types based on how common they are.
    const suggestedInterfaceTypes = Object.keys(interfaceUsageCount)
      .sort((a, b) => interfaceUsageCount[b] - interfaceUsageCount[a]);

    // Suggest both interface and object types.
    return suggestedInterfaceTypes.concat(suggestedObjectTypes);
  }

  // Otherwise, must be an Object type, which does not have possible fields.
  return [];
}

/**
 * For the field name provided, determine if there are any similar field names
 * that may be the result of a typo.
 */
function getSuggestedFieldNames(
  schema: GraphQLSchema,
  type: GraphQLOutputType,
  fieldName: string
): Array<string> {
  if (type instanceof GraphQLObjectType ||
      type instanceof GraphQLInterfaceType) {
    const possibleFieldNames = Object.keys(type.getFields());
    return suggestionList(fieldName, possibleFieldNames);
  }
  // Otherwise, must be a Union type, which does not define fields.
  return [];
}
