import 'package:flutter/material.dart';
import 'package:flutter_typeahead/flutter_typeahead.dart';
import '../services/address_service.dart';
import 'package:dash_master_toolkit/localization/app_localizations.dart';

class AddressAutocompleteField extends StatelessWidget {
  final TextEditingController controller;
  final void Function(AddressSuggestion) onSelected;
  final String hintText;
  final String? Function(String?)? validator;

  const AddressAutocompleteField({
    super.key,
    required this.controller,
    required this.onSelected,
    required this.hintText,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return FormField<String>(
      validator: validator ??
          (_) {
            if (controller.text.trim().isEmpty) {
              return AppLocalizations.of(context).translate("Localisation est obligatoire");
            }
            return null;
          },
      builder: (state) {
        return TypeAheadField<AddressSuggestion>(
          suggestionsCallback: (pattern) async {
            return AddressService.search(pattern);
          },
          itemBuilder: (context, s) => ListTile(
            title: Text(
              s.displayName,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          onSelected: (s) {
            controller.text = s.displayName;
            onSelected(s);
            state.didChange(controller.text);
          },
          builder: (context, textController, focusNode) {
            // ✅ Sync initial
            if (textController.text != controller.text) {
              textController.text = controller.text;
              textController.selection = TextSelection.collapsed(offset: textController.text.length);
            }

            return TextField(
              controller: textController,
              focusNode: focusNode,
              decoration: InputDecoration(
                hintText: hintText,
                border: const OutlineInputBorder(),
                errorText: state.errorText,
              ),
              onChanged: (v) {
                controller.text = v;
                state.didChange(v);
              },
            );
          },
          emptyBuilder: (_) => Padding(
            padding: const EdgeInsets.all(12),
            child: Text(AppLocalizations.of(context).translate("Aucune adresse trouvée.")),
          ),
          loadingBuilder: (_) => const Padding(
            padding: EdgeInsets.all(12),
            child: SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        );
      },
    );
  }
}
