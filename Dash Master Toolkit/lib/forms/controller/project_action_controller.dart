import 'package:get/get.dart';
import '../../services/project_action_api.dart';
import 'package:dash_master_toolkit/application/users/model/project_action.dart';
class ProjectActionController extends GetxController {

  final actions = <ProjectAction>[].obs;

  final loading = false.obs;

  Future<void> loadActions(String projectId) async {

    loading.value = true;

    try{

      final list = await ProjectActionApi.instance
          .getActions(projectId);

      actions.assignAll(list);

    }catch(e){

      actions.clear();

    }finally{

      loading.value = false;

    }

  }

}