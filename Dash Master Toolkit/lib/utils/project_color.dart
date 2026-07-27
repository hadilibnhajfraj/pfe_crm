import 'package:flutter/material.dart';

Color getProjectColor(String? stage) {

  switch(stage){

    case "prospect":
      return Colors.blue;

    case "visite":
      return Colors.orange;

    case "plan":
      return Colors.deepPurple;

    case "devis":
      return Colors.purple;

    case "relance":
      return Colors.red;

    case "commande":
      return Colors.green;

    default:
      return Colors.grey;
  }

}